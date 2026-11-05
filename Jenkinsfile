pipeline{
    agent {label 'library'}

    tools{
        nodejs 'nodejs'
    }

    environment{
        FIMAGE_NAME = "library-frontend"
        BIMAGE_NAME = "library-backend"
        TAG="${BUILD_NUMBER}"
    }

    stages{
        stage('Cloning the code from the github'){
            steps{
                checkout scm
            }
        }

        stage('Build the application'){
            steps{
                dir('client'){
                    sh 'npm ci'
                }
                dir('server'){
                    sh 'npm ci'
                }
            }
        }

        stage('Unit testing'){
            steps{
                dir('client'){
                    sh 'npm test'
                    echo 'frontend unit testing done successfully'
                }
                dir('server'){
                    sh 'npm test'
                    echo 'backend unit testing done successfully'
                }
            }
        }

        stage('Static Code Analysis'){
            steps{
                dir('client'){
                    sh 'npm run lint'
                    echo 'frontend static code analysis done'
                }
                dir('server'){
                    sh 'npm run lint'
                    echo 'backend static code analysis done'
                }
            }
        }

        stage('SonarQube Analysis') {
         steps {
             script {
            def scannerHome = tool 'SonarScanner'

                withSonarQubeEnv('SonarQube-Server') {
                 sh "${scannerHome}/bin/sonar-scanner"
                    }
                }
            }
        }

        stage('Quality Gate') {
          steps {
                timeout(time: 3, unit: 'MINUTES') {
                waitForQualityGate abortPipeline: true
                }
             }
        }

        stage('Docker Build and Push to Docker Hub'){
            steps{
                withCredentials([
                  usernamePassword(
                      credentialsId : 'userlibrary',
                      usernameVariable : 'docker_user',
                      passwordVariable : 'docker_pass'
                  )
                ])
                {
                    dir('client'){
                        sh 'docker build -t ${docker_user}/${FIMAGE_NAME}:${BUILD_NUMBER} .'
                    }

                    dir('server'){
                       sh 'docker build -t ${docker_user}/${BIMAGE_NAME}:${BUILD_NUMBER} .'
                    }

                    sh '''
                    trivy image --severity HIGH,CRITICAL --exit-code 0 $docker_user/${FIMAGE_NAME}:${BUILD_NUMBER}
                    trivy image --severity HIGH,CRITICAL --exit-code 0 $docker_user/${BIMAGE_NAME}:${BUILD_NUMBER}
                    '''

                    sh '''
                    echo $docker_pass | docker login -u $docker_user --password-stdin
                    docker push $docker_user/${FIMAGE_NAME}:${BUILD_NUMBER}
                    docker push $docker_user/${BIMAGE_NAME}:${BUILD_NUMBER}
                    '''
                }
            }
        }

        stage('ENV file configuration'){
            steps{
                withCredentials([
                    file(credentialsId:'libraryenv',variable:'SERVER_ENV')
                ]){
                    sh 'rm -f server/.env'
                    sh 'cp "$SERVER_ENV"  server/.env'
                }
            }   
        }

        stage('Deploy application'){
            steps{
                sh '''
                export TAG="${BUILD_NUMBER}"
                docker compose pull
                docker compose up -d --remove-orphans
                '''
            }
        }
    }
    
    post{
        always{
            sh 'docker logout || true'
            sh 'docker image prune -f'
        }
        failure{
            echo 'Build failed , please check console output'
            }
        }
    }