require('dotenv').config();
const express = require('express'), mongoose = require('mongoose'), cors = require('cors');
const bcrypt = require('bcryptjs'), jwt = require('jsonwebtoken'), crypto = require('crypto'), nodemailer = require('nodemailer');
const { User, Book, Loan, Reservation } = require('./models');
const SECRET = process.env.JWT_SECRET || 'dev-secret';
// The librarian account lives in server/.env, not in the database.
const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || '').trim().toLowerCase(), ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';
if (!ADMIN_EMAIL || !ADMIN_PASSWORD) { console.error('Set ADMIN_EMAIL and ADMIN_PASSWORD in server/.env'); process.exit(1); }
const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5173';
const LIMIT = 3, DAYS = 14, RENEW_DAYS = 7, RATE = 5, DAY = 864e5; // max books, loan days, renewal days, ₹ fine per day

const app = express();
app.disable('x-powered-by');
app.use(cors({ origin: CLIENT_URL }));
app.use(express.json()); const w = f => (q, s) => f(q, s).catch(e => s.status(400).json({ message: e.message }));
const auth = role => (req, res, next) => {
  try { req.user = jwt.verify((req.headers.authorization || '').slice(7), SECRET); }
  catch { return res.status(401).json({ message: 'Please log in again' }); }
  if (role && req.user.role !== role) return res.status(403).json({ message: 'Only the librarian can do this' });
  next();
};
const fineFor = l => Math.max(0, Math.ceil(((l.returnedAt || Date.now()) - l.dueAt) / DAY)) * RATE;
const withFine = l => ({ ...l.toObject(), fine: l.returnedAt ? l.fine : fineFor(l) });

// A returned copy goes to the first student waiting for it, otherwise back on the shelf.
async function release(bookId) {
  const next = await Reservation.findOne({ book: bookId, status: 'waiting' }).sort('createdAt');
  if (next) { next.status = 'ready'; await next.save(); } else await Book.findByIdAndUpdate(bookId, { $inc: { available: 1 } });
}
async function lend(bookId, userId) {
  const u = await User.findById(userId);
  if (!u) throw new Error('Student not found');
  if (u.blocked) throw new Error('This account is blocked. Please see the librarian');
  const mine = await Loan.find({ user: userId });
  const active = mine.filter(l => !l.returnedAt);
  if (active.length >= LIMIT) throw new Error(`Borrow limit reached (${LIMIT} books). Return one first`);
  if (active.some(l => String(l.book) === String(bookId))) throw new Error('You already have this book');
  if (mine.some(l => (l.returnedAt ? l.fine > 0 && !l.finePaid : l.dueAt < Date.now()))) throw new Error('Clear your overdue books and unpaid fines first');
  const b = await Book.findById(bookId);
  if (!b) throw new Error('Book not found');
  const held = await Reservation.findOne({ book: bookId, user: userId, status: 'ready' });
  if (held) { held.status = 'done'; await held.save(); }
  else { if (b.available < 1) throw new Error('No copies available. You can reserve this book'); b.available--; await b.save(); }
  return Loan.create({ book: bookId, user: userId, dueAt: new Date(Date.now() + DAYS * DAY) });
}

// ---- auth
const sign = (payload, remember) => jwt.sign(payload, SECRET, { expiresIn: remember ? '30d' : '1d' });
const session = (u, remember) => ({
  token: sign({ id: u._id, role: u.role, name: u.name }, remember),
  user: { name: u.name, email: u.email, role: u.role, studentId: u.studentId, department: u.department }
});
const same = (a, b) => { const x = Buffer.from(a), y = Buffer.from(b); return x.length === y.length && crypto.timingSafeEqual(x, y); };
const sha = t => crypto.createHash('sha256').update(String(t)).digest('hex');
const mailer = process.env.SMTP_HOST ? nodemailer.createTransport({
  host: process.env.SMTP_HOST, port: +process.env.SMTP_PORT || 587,
  secure: +process.env.SMTP_PORT === 465, auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
}) : null;
async function sendMail(to, subject, text, html) {
  if (!mailer) return console.log(`\n[Email is not configured, so this is printed instead]\nTo: ${to}\n${text}\n`);
  await mailer.sendMail({ from: process.env.MAIL_FROM || process.env.SMTP_USER, to, subject, text, html });
}

app.post('/api/auth/register', w(async (q, s) => {
  const { name, email, password, studentId, department } = q.body;
  if (!name || !email || !password || !studentId) throw new Error('Name, email, student ID and password are required');
  if (password.length < 6) throw new Error('Password must be at least 6 characters');
  if (email.trim().toLowerCase() === ADMIN_EMAIL) throw new Error('That email is already registered');
  if (await User.findOne({ email: email.toLowerCase() })) throw new Error('That email is already registered');
  s.json(session(await User.create({ name, email, studentId, department, password: await bcrypt.hash(password, 10) }), true));
}));
app.post('/api/auth/login', w(async (q, s) => {
  const email = (q.body.email || '').trim().toLowerCase(), password = q.body.password || '', remember = !!q.body.remember;
  if (email === ADMIN_EMAIL) {
    if (!same(password, ADMIN_PASSWORD)) throw new Error('Wrong email or password');
    return s.json({ token: sign({ id: 'admin', role: 'admin', name: 'Librarian' }, remember), user: { name: 'Librarian', email: ADMIN_EMAIL, role: 'admin' } });
  }
  const u = await User.findOne({ email });
  if (!u || !(await bcrypt.compare(password, u.password))) throw new Error('Wrong email or password');
  s.json(session(u, remember));
}));
// Student asks for a reset link. The reply is the same whether or not the email exists.
app.post('/api/auth/forgot', w(async (q, s) => {
  const u = await User.findOne({ email: (q.body.email || '').trim().toLowerCase() });
  if (u) {
    const raw = crypto.randomBytes(32).toString('hex'), link = `${CLIENT_URL}/?reset=${raw}`;
    u.resetHash = sha(raw); u.resetExpires = new Date(Date.now() + 10 * 60 * 1000); await u.save();
    try {
      await sendMail(u.email, 'Update your Stacks password',
        `Hi ${u.name},\n\nUse this link to choose a new password (valid for 10 minutes):\n${link}\n\nIf you did not ask for this, you can ignore this email.`,
        `<p>Hi ${u.name},</p><p><a href="${link}">Update your password</a> (valid for 10 minutes).</p><p>If you did not ask for this, you can ignore this email.</p>`);
    } catch (e) { console.error('Could not send reset email:', e.message); }
  }
  s.json({ message: 'If that email is registered, we have sent a link to update your password.' });
}));
// The new password is hashed and saved in the database.
app.post('/api/auth/reset', w(async (q, s) => {
  const { token: t, password } = q.body;
  if (!password || password.length < 6) throw new Error('Password must be at least 6 characters');
  const u = t && await User.findOne({ resetHash: sha(t), resetExpires: { $gt: new Date() } });
  if (!u) throw new Error('This link is invalid or has expired. Please request a new one');
  u.password = await bcrypt.hash(password, 10); u.resetHash = undefined; u.resetExpires = undefined; await u.save();
  s.json({ message: 'Password updated. You can log in now.' });
}));

// ---- books
app.get('/api/books', auth(), w(async (q, s) => {
  const r = new RegExp((q.query.q || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
  s.json(await Book.find({ $or: [{ title: r }, { author: r }, { genre: r }, { isbn: r }] }).sort('title'));
}));
app.post('/api/books', auth('admin'), w(async (q, s) => {
  const copies = Math.max(1, +q.body.copies || 1);
  s.json(await Book.create({ ...q.body, copies, available: copies }));
}));
app.put('/api/books/:id', auth('admin'), w(async (q, s) => {
  const b = await Book.findById(q.params.id);
  const { available, _id, ...rest } = q.body, copies = Math.max(1, +rest.copies || b.copies);
  b.available = Math.max(0, b.available + copies - b.copies);
  Object.assign(b, rest, { copies }); s.json(await b.save());
}));
app.delete('/api/books/:id', auth('admin'), w(async (q, s) => {
  if (await Loan.exists({ book: q.params.id, returnedAt: null })) throw new Error('This book is on loan. Return it before deleting');
  await Book.findByIdAndDelete(q.params.id); s.json({ ok: true });
}));

// ---- loans
app.get('/api/loans', auth(), w(async (q, s) => {
  const f = q.user.role === 'admin' ? {} : { user: q.user.id };
  s.json((await Loan.find(f).populate('book').populate('user', 'name email studentId').sort('-issuedAt')).map(withFine));
}));
app.post('/api/loans', auth(), w(async (q, s) => {
  const who = q.user.role === 'admin' ? q.body.userId : q.user.id;
  if (!who) throw new Error('Choose a student');
  s.json(await lend(q.body.bookId, who));
}));
app.put('/api/loans/:id/return', auth(), w(async (q, s) => {
  const l = await Loan.findById(q.params.id);
  if (!l || l.returnedAt) throw new Error('Loan not found');
  if (q.user.role !== 'admin' && String(l.user) !== q.user.id) throw new Error('This is not your loan');
  l.returnedAt = new Date(); l.fine = fineFor(l); await l.save(); await release(l.book);
  s.json(l);
}));
app.put('/api/loans/:id/renew', auth(), w(async (q, s) => {
  const l = await Loan.findById(q.params.id);
  if (!l || l.returnedAt) throw new Error('Loan not found');
  if (q.user.role !== 'admin' && String(l.user) !== q.user.id) throw new Error('This is not your loan');
  if (l.renewals >= 1) throw new Error('Each book can be renewed once');
  if (l.dueAt < Date.now()) throw new Error('Overdue books cannot be renewed. Please return it');
  if (await Reservation.exists({ book: l.book, status: 'waiting' })) throw new Error('Another student is waiting for this book');
  l.dueAt = new Date(+l.dueAt + RENEW_DAYS * DAY); l.renewals++; s.json(await l.save());
}));
app.put('/api/loans/:id/payfine', auth('admin'), w(async (q, s) => {
  const l = await Loan.findById(q.params.id);
  if (!l || !l.returnedAt) throw new Error('Return the book before collecting the fine');
  l.finePaid = true; s.json(await l.save());
}));

// ---- reservations
app.get('/api/reservations', auth(), w(async (q, s) => {
  const f = { status: { $in: ['waiting', 'ready'] }, ...(q.user.role === 'admin' ? {} : { user: q.user.id }) };
  const rs = await Reservation.find(f).populate('book').populate('user', 'name studentId').sort('createdAt');
  s.json(await Promise.all(rs.map(async r => ({ ...r.toObject(), position: await Reservation.countDocuments({ book: r.book?._id, status: 'waiting', createdAt: { $lte: r.createdAt } }) }))));
}));
app.post('/api/reservations', auth(), w(async (q, s) => {
  const b = await Book.findById(q.body.bookId);
  if (!b) throw new Error('Book not found');
  if (b.available > 0) throw new Error('Copies are available. Borrow it instead');
  if (await Reservation.exists({ book: b._id, user: q.user.id, status: { $in: ['waiting', 'ready'] } })) throw new Error('You already reserved this book');
  if (await Loan.exists({ book: b._id, user: q.user.id, returnedAt: null })) throw new Error('You already have this book');
  s.json(await Reservation.create({ book: b._id, user: q.user.id }));
}));
app.delete('/api/reservations/:id', auth(), w(async (q, s) => {
  const r = await Reservation.findById(q.params.id);
  if (!r || !['waiting', 'ready'].includes(r.status)) throw new Error('Reservation not found');
  if (q.user.role !== 'admin' && String(r.user) !== q.user.id) throw new Error('This is not your reservation');
  const wasReady = r.status === 'ready'; r.status = 'cancelled'; await r.save();
  if (wasReady) await release(r.book);
  s.json({ ok: true });
}));

// ---- students & stats (librarian)
app.get('/api/users', auth('admin'), w(async (q, s) => {
  const [us, ls] = await Promise.all([User.find({ role: 'student' }).select('-password').sort('name'), Loan.find()]);
  s.json(us.map(u => {
    const mine = ls.filter(l => String(l.user) === String(u._id));
    return {
      ...u.toObject(), active: mine.filter(l => !l.returnedAt).length,
      owed: mine.filter(l => !l.finePaid).reduce((a, l) => a + (l.returnedAt ? l.fine : fineFor(l)), 0)
    };
  }));
}));
app.put('/api/users/:id/block', auth('admin'), w(async (q, s) => {
  const u = await User.findById(q.params.id); u.blocked = !u.blocked; await u.save(); s.json({ blocked: u.blocked });
}));
app.get('/api/stats', auth('admin'), w(async (q, s) => {
  const [titles, students, out, overdue, genres, top] = await Promise.all([
    Book.countDocuments(), User.countDocuments({ role: 'student' }), Loan.countDocuments({ returnedAt: null }),
    Loan.countDocuments({ returnedAt: null, dueAt: { $lt: new Date() } }),
    Book.aggregate([{ $group: { _id: '$genre', n: { $sum: '$copies' } } }, { $sort: { n: -1 } }]),
    Loan.aggregate([{ $group: { _id: '$book', n: { $sum: 1 } } }, { $sort: { n: -1 } }, { $limit: 5 },
    { $lookup: { from: 'books', localField: '_id', foreignField: '_id', as: 'b' } }, { $unwind: '$b' }, { $project: { title: '$b.title', n: 1 } }]),
  ]);
  s.json({ titles, students, out, overdue, genres, top });
}));

// ---- sample books
async function seed() {
  if (await Book.countDocuments()) return;
  const data = [
    ['The Alchemist', 'Paulo Coelho', 'Fiction', 1988, 'A-01', 'A shepherd boy travels from Spain to Egypt in search of treasure and his own destiny.'],
    ['The Guide', 'R.K. Narayan', 'Fiction', 1958, 'A-02', 'A tourist guide is mistaken for a holy man in a small South Indian village.'],
    ['Atomic Habits', 'James Clear', 'Self-help', 2018, 'B-01', 'A practical system for building good habits and breaking bad ones, one small change at a time.'],
    ['Deep Work', 'Cal Newport', 'Self-help', 2016, 'B-02', 'Why focus is a rare skill and how to train it in a distracted world.'],
    ['Clean Code', 'Robert C. Martin', 'Technology', 2008, 'C-01', 'A handbook of agile software craftsmanship on writing readable, maintainable code.'],
    ['The Pragmatic Programmer', 'Andrew Hunt', 'Technology', 1999, 'C-02', 'Timeless advice for developers who want to work smarter and ship better software.'],
    ['Designing Data-Intensive Applications', 'Martin Kleppmann', 'Technology', 2017, 'C-03', 'The big ideas behind reliable, scalable and maintainable data systems.'],
    ['The Phoenix Project', 'Gene Kim', 'Technology', 2013, 'C-04', 'A novel about IT, DevOps and helping your business win.'],
    ['Sapiens', 'Yuval Noah Harari', 'History', 2011, 'D-01', 'A brief history of humankind, from the Stone Age to the age of AI.'],
    ['Train to Pakistan', 'Khushwant Singh', 'History', 1956, 'D-02', 'A village on the border faces the horror of Partition in 1947.'],
    ['A Brief History of Time', 'Stephen Hawking', 'Science', 1988, 'E-01', 'From the Big Bang to black holes, explained for the curious reader.'],
    ['Wings of Fire', 'A.P.J. Abdul Kalam', 'Biography', 1999, 'F-01', 'The autobiography of the Missile Man of India and his journey from Rameswaram.'],
  ];
  await Book.insertMany(data.map(([title, author, genre, year, shelf, description], i) =>
    ({ title, author, genre, year, shelf, description, isbn: '978-81-' + (7000 + i * 37), copies: 2 + (i % 3), available: 2 + (i % 3) })));
  console.log('Sample books added');
}

// Start the server only when run directly (node server.js). Tests import `app` without starting it.
if (require.main === module) {
  mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/library')
    .then(seed).then(() => app.listen(process.env.PORT || 5000, () => console.log('API ready on http://localhost:5000')))
    .catch(e => { console.error('MongoDB connection failed:', e.message); process.exit(1); });
}
module.exports = { app, fineFor };
