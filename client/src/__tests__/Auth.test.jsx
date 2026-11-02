import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import Auth from '../Auth';
import { mockFetch } from './helpers';

afterEach(() => vi.restoreAllMocks());

const type = (placeholder, value) => fireEvent.change(screen.getByPlaceholderText(placeholder), { target: { value } });

describe('<Auth /> login', () => {
  it('shows the login form first', () => {
    render(<Auth onLogin={() => {}} />);
    expect(screen.getByRole('heading', { name: 'Welcome back' })).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Email')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Log in' })).toBeInTheDocument();
  });

  it('"Remember me" is ticked by default', () => {
    render(<Auth onLogin={() => {}} />);
    expect(screen.getByLabelText('Remember me')).toBeChecked();
  });

  it('sends email and password to the API and calls onLogin', async () => {
    const reply = { token: 't123', user: { name: 'Yash', role: 'student' } };
    const calls = mockFetch({ 'POST /auth/login': reply });
    const onLogin = vi.fn();
    render(<Auth onLogin={onLogin} />);

    type('Email', 'yash@test.com');
    type('Password', 'secret123');
    fireEvent.click(screen.getByRole('button', { name: 'Log in' }));

    await waitFor(() => expect(onLogin).toHaveBeenCalledWith(reply, true));
    expect(calls[0].path).toBe('/auth/login');
    expect(calls[0].body).toMatchObject({ email: 'yash@test.com', password: 'secret123' });
  });

  it('shows the error from the server and does not log in', async () => {
    mockFetch({ 'POST /auth/login': { error: 'Wrong email or password' } });
    const onLogin = vi.fn();
    render(<Auth onLogin={onLogin} />);

    type('Email', 'yash@test.com');
    type('Password', 'wrong');
    fireEvent.click(screen.getByRole('button', { name: 'Log in' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Wrong email or password');
    expect(onLogin).not.toHaveBeenCalled();
  });
});

describe('<Auth /> register', () => {
  const openRegister = () => fireEvent.click(screen.getByText('Create an account'));

  it('shows extra fields for students', () => {
    render(<Auth onLogin={() => {}} />);
    openRegister();
    expect(screen.getByRole('heading', { name: 'Student sign up' })).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Full name')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Student ID')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create account' })).toBeInTheDocument();
  });

  it('sends all details to /auth/register', async () => {
    const calls = mockFetch({ 'POST /auth/register': { token: 't', user: { name: 'Yash' } } });
    const onLogin = vi.fn();
    render(<Auth onLogin={onLogin} />);
    openRegister();

    type('Full name', 'Yash Palanpure');
    type('Student ID', 'S101');
    type('Email', 'yash@test.com');
    type('New password (6+ characters)', 'secret123');
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }));

    await waitFor(() => expect(onLogin).toHaveBeenCalled());
    expect(calls[0].path).toBe('/auth/register');
    expect(calls[0].body).toMatchObject({ name: 'Yash Palanpure', studentId: 'S101', email: 'yash@test.com', department: 'Information Technology' });
  });

  it('can go back to login', () => {
    render(<Auth onLogin={() => {}} />);
    openRegister();
    fireEvent.click(screen.getByText('Back to log in'));
    expect(screen.getByRole('heading', { name: 'Welcome back' })).toBeInTheDocument();
  });
});

describe('<Auth /> forgot password', () => {
  it('asks for the email only and shows the confirmation message', async () => {
    const calls = mockFetch({ 'POST /auth/forgot': { message: 'If that email is registered, we have sent a link.' } });
    render(<Auth onLogin={() => {}} />);

    fireEvent.click(screen.getByText('Forgot password?'));
    expect(screen.getByRole('heading', { name: 'Forgot your password?' })).toBeInTheDocument();
    expect(screen.queryByPlaceholderText('Password')).not.toBeInTheDocument();

    type('Email', 'yash@test.com');
    fireEvent.click(screen.getByRole('button', { name: 'Email me a link' }));

    expect(await screen.findByRole('status')).toHaveTextContent('we have sent a link');
    expect(calls[0].path).toBe('/auth/forgot');
    expect(calls[0].body).toEqual({ email: 'yash@test.com' });
  });
});
