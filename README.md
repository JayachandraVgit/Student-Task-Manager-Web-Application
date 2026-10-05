# Student Task Manager Web Application

A single-page student productivity dashboard: plan today's tasks, separate **deep work** from **shallow work**, track daily progress, see a compact timeline of the day, and focus with a Pomodoro timer. Built with plain HTML, CSS and JavaScript on the front end and a small dependency-free Node.js backend that stores tasks in a JSON file.

## Quick start

Requires Node.js 18 or newer (no `npm install` needed, there are no dependencies).

```bash
cd ~/Student-Task-Manager-Web-Application
npm start
```

Open <http://localhost:3000>. Tasks are saved to `data/tasks.json` and survive restarts.

| Command | What it does |
|---|---|
| `npm start` | Runs the backend and serves the dashboard on port 3000 |
| `PORT=4000 npm start` | Uses another port |
| `npm test` | Runs the backend API tests and the dashboard logic tests |
| `npm run build` | Copies the frontend into `dist/` as a static bundle |

> **Important:** the dashboard needs the backend. Opening `index.html` directly or serving it with `python3 -m http.server` will show a "Couldn't load your tasks" message because there is no API behind it.

Environment variables: `PORT` (default 3000), `HOST` (default `127.0.0.1`; use `0.0.0.0` to expose it on your network), `DATA_FILE` (default `data/tasks.json`).

## Features

- **One dashboard page**, no separate pages or navigation.
- **Summary cards** (Pending, Remaining, Deep work, Shallow work), all calculated from the real task data.
- **Daily progress bar** with percentage, "x of y completed" and a short message. Safe when there are no tasks.
- **Task list** grouped into deep work (first) and shallow work, sorted by completion, priority and scheduled time. Check to complete, check again to reopen, edit, delete (with Undo).
- **Filters**: All, Deep work, Shallow work, Pending, Completed, each with a live count.
- **Add / edit task dialog** with name, description, type, priority, duration, optional time and date. Validates input, blocks double submits, closes with Cancel, X, backdrop click or Escape.
- **Today timeline**: scheduled tasks in time order with start and end times, a "now" marker, and an "Anytime" list for tasks without a time.
- **Pomodoro timer** (collapsible): Focus 25 min, Short break 5 min, Long break 15 min after four focus sessions. Start, pause, reset, session dots, optional "Working on" deep work task. Shows the countdown in the browser tab title and plays a short beep when a session ends.
- **Day switcher** (the arrows beside the date) to plan ahead or look back on the same page.
- **Responsive**: 4 summary cards on desktop, 2 on tablet and phone; task list before the timeline on small screens; floating Add task button on phones.

## Project structure

```text
Student-Task-Manager-Web-Application/
├── server.js            Backend: REST API, JSON storage, static file server
├── index.html           Dashboard markup (header, cards, lists, dialog)
├── style.css            Design system and responsive layout
├── script.js            Dashboard: state, rendering, dialog, actions
├── js/
│   ├── api.js           fetch wrapper for the REST API
│   ├── dates.js         date/time formatting helpers
│   ├── stats.js         summary, progress, sorting, filters, timeline (pure functions)
│   └── pomodoro.js      Pomodoro state machine (no DOM code)
├── test/                API tests and logic tests (node:test)
├── data/tasks.json      Created on first run (git-ignored)
├── dist/                Static frontend bundle from `npm run build`
├── Dockerfile
└── k8s/                 deployment.yaml, service.yaml, pvc.yaml
```

## REST API

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/tasks` | List all tasks, or `?date=YYYY-MM-DD` for one day |
| POST | `/api/tasks` | Create a task |
| GET | `/api/tasks/:id` | Get one task |
| PATCH | `/api/tasks/:id` | Update any fields, including `completed` |
| DELETE | `/api/tasks/:id` | Delete a task |

Task fields: `title` (required, max 120), `description` (max 500), `type` (`deep` or `shallow`), `priority` (`high`, `medium`, `low`), `duration` (1 to 600 minutes), `time` (`HH:MM`, optional), `date` (`YYYY-MM-DD`), `completed`. Invalid input returns `400` with a `fields` object of per-field messages.

## Known limitations

- Storage is a single JSON file. That is fine for one person on one machine, but not for many users or many server copies. There is no login: anyone who can reach the server can edit the tasks, which is why it listens on `127.0.0.1` by default.
- The Pomodoro timer lives in the browser tab: refreshing the page resets it.
- The greeting name is set in one place: `USER_NAME` at the top of `script.js`.
- Inter is loaded from Google Fonts. Offline, the page falls back to the system font.

---

# DevOps notes (Git, Docker, Jenkins, Kubernetes)

The sections below are the original command reference. The application is now a Node.js server rather than a static Nginx site, so the Docker and Kubernetes sections have these differences: the container runs `node server.js` on port 80, tasks are stored in `/app/data`, and the Kubernetes deployment uses one replica plus a `PersistentVolumeClaim` (`kubectl apply -f k8s/` applies all three files). Where the text below says "Nginx" or "static", read "Node.js server".

---

## 1. Project Structure

```text
Student-Task-Manager-Web-Application/
│
├── index.html
├── script.js
├── style.css
├── package.json
├── package-lock.json
├── Dockerfile
├── .dockerignore
│
├── dist/
│   ├── index.html
│   ├── script.js
│   └── style.css
│
└── k8s/
    ├── deployment.yaml
    └── service.yaml
```

---

# 2. Check Ubuntu Environment

Open Terminal and go to the project directory:

```bash
cd ~/Student-Task-Manager-Web-Application
```

Check the files:

```bash
ls
```

Check detailed files:

```bash
ls -l
```

Check Java:

```bash
java --version
```

Check Git:

```bash
git --version
```

Check Docker:

```bash
docker --version
```

Check Kubernetes:

```bash
kubectl version --client
```

Check Minikube, if installed:

```bash
minikube version
```

Check Jenkins:

```bash
sudo systemctl status jenkins
```

---

# 3. Run the Web Application Locally

Use `npm start` and open `http://localhost:3000` (see Quick start above). `python3 -m http.server` will not work any more.

---

# 4. NPM Commands

Check Node.js:

```bash
node --version
```

Check npm:

```bash
npm --version
```

Install dependencies (there are none, this step can be skipped):

```bash
npm install
```

Build the project:

```bash
npm run build
```

The build command copies the frontend files into the `dist/` directory.

---

# 5. Git Commands

## Configure Git

Run these only if Git is not already configured:

```bash
git config --global user.name "Your Name"
git config --global user.email "your-email@example.com"
```

Check configuration:

```bash
git config --global --list
```

---

## Initialize Git Repository

From the project directory:

```bash
cd ~/Student-Task-Manager-Web-Application
```

Initialize Git:

```bash
git init
```

Check status:

```bash
git status
```

---

## Add Files

Add all project files:

```bash
git add .
```

Check staged files:

```bash
git status
```

Create the first commit:

```bash
git commit -m "Initial commit"
```

---

# 6. GitHub Commands

## Create a GitHub Repository

Create an empty repository on GitHub.

Example repository name:

```text
Student-Task-Manager-Web-Application
```

Do not add README, .gitignore or license from GitHub if the local project already contains them.

---

## Connect Local Project to GitHub

Replace `YOUR_USERNAME` with your GitHub username:

```bash
git remote add origin https://github.com/YOUR_USERNAME/Student-Task-Manager-Web-Application.git
```

Check remote:

```bash
git remote -v
```

Rename the branch to `main`:

```bash
git branch -M main
```

Push the project:

```bash
git push -u origin main
```

---

## Future GitHub Updates

After changing files:

```bash
git status
```

Add changes:

```bash
git add .
```

Commit:

```bash
git commit -m "Update application"
```

Push:

```bash
git push
```

Pull latest changes:

```bash
git pull
```

View commit history:

```bash
git log --oneline
```

View branches:

```bash
git branch
```

---

# 7. Useful Git Commands

Check status:

```bash
git status
```

View changes:

```bash
git diff
```

View remote repository:

```bash
git remote -v
```

Create a branch:

```bash
git branch feature
```

Switch branch:

```bash
git checkout feature
```

Create and switch to a new branch:

```bash
git checkout -b feature
```

Merge a branch:

```bash
git checkout main
git merge feature
```

Delete a local branch:

```bash
git branch -d feature
```

---

# 8. Docker

## Check Docker

```bash
docker --version
```

Check Docker service:

```bash
sudo systemctl status docker
```

Start Docker:

```bash
sudo systemctl start docker
```

Enable Docker at startup:

```bash
sudo systemctl enable docker
```

Test Docker:

```bash
sudo docker run hello-world
```

---

# 9. Docker Build

Go to the project directory:

```bash
cd ~/Student-Task-Manager-Web-Application
```

Build the Docker image:

```bash
docker build -t task-manager:1.0 .
```

Check images:

```bash
docker images
```

The image should contain:

```text
task-manager
```

---

# 10. Run Docker Container

Run the application:

```bash
docker run -d --name task-manager-container -p 3000:80 task-manager:1.0
```

Check running containers:

```bash
docker ps
```

Open the application:

```text
http://localhost:3000
```

The Dockerfile runs the Node.js server, which listens on port `80` inside the container.

Therefore:

```text
localhost:3000  --->  container port 80
```

---

## Stop Docker Container

```bash
docker stop task-manager-container
```

Start it again:

```bash
docker start task-manager-container
```

Remove the container:

```bash
docker rm task-manager-container
```

Force remove a running container:

```bash
docker rm -f task-manager-container
```

---

# 11. Useful Docker Commands

List running containers:

```bash
docker ps
```

List all containers:

```bash
docker ps -a
```

View container logs:

```bash
docker logs task-manager-container
```

Follow container logs:

```bash
docker logs -f task-manager-container
```

List images:

```bash
docker images
```

Remove an image:

```bash
docker rmi task-manager:1.0
```

Remove unused Docker objects:

```bash
docker system prune
```

---

# 12. Docker Hub

Login:

```bash
docker login
```

Tag the image:

```bash
docker tag task-manager:1.0 YOUR_USERNAME/task-manager:1.0
```

Push the image:

```bash
docker push YOUR_USERNAME/task-manager:1.0
```

Pull the image:

```bash
docker pull YOUR_USERNAME/task-manager:1.0
```

Run the Docker Hub image:

```bash
docker run -d --name task-manager-container -p 3000:80 YOUR_USERNAME/task-manager:1.0
```

---

# 13. Jenkins

## Check Jenkins

```bash
sudo systemctl status jenkins
```

Start Jenkins:

```bash
sudo systemctl start jenkins
```

If Ubuntu shows:

```text
Warning: The unit file, source configuration file or drop-ins of jenkins.service changed on disk.
Run 'systemctl daemon-reload' to reload units.
```

Run:

```bash
sudo systemctl daemon-reload
```

Then:

```bash
sudo systemctl restart jenkins
```

Check again:

```bash
sudo systemctl status jenkins
```

---

## Enable Jenkins at Startup

```bash
sudo systemctl enable jenkins
```

Check whether Jenkins is running:

```bash
sudo systemctl is-active jenkins
```

---

## Stop Jenkins

```bash
sudo systemctl stop jenkins
```

Restart Jenkins:

```bash
sudo systemctl restart jenkins
```

View Jenkins logs:

```bash
sudo journalctl -u jenkins -n 50 --no-pager
```

Follow Jenkins logs:

```bash
sudo journalctl -u jenkins -f
```

---

## Jenkins Web Interface

Open:

```text
http://localhost:8080
```

If Jenkins asks for the initial administrator password:

```bash
sudo cat /var/lib/jenkins/secrets/initialAdminPassword
```

Copy the displayed password into the Jenkins setup page.

---

# 14. Jenkins Project Build Commands

The current project does not contain a `Jenkinsfile`, so a Jenkins Freestyle project can use shell commands such as:

```bash
cd $WORKSPACE
npm install
npm run build
docker build -t task-manager:1.0 .
```

For a Jenkins job that also deploys to Kubernetes:

```bash
cd $WORKSPACE
npm install
npm run build
docker build -t task-manager:1.0 .
kubectl apply -f k8s/deployment.yaml
kubectl apply -f k8s/service.yaml
```

If using Minikube and the image is built locally:

```bash
minikube image load task-manager:1.0
kubectl apply -f k8s/deployment.yaml
kubectl apply -f k8s/service.yaml
```

---

# 15. Kubernetes

## Check Kubernetes

```bash
kubectl version --client
```

Check cluster information:

```bash
kubectl cluster-info
```

Check nodes:

```bash
kubectl get nodes
```

Check all resources:

```bash
kubectl get all
```

---

# 16. Start Minikube

If Minikube is being used:

```bash
minikube start
```

Check status:

```bash
minikube status
```

Check Kubernetes nodes:

```bash
kubectl get nodes
```

---

# 17. Load Docker Image into Minikube

The Kubernetes Deployment uses:

```text
task-manager:1.0
```

Load the locally built Docker image into Minikube:

```bash
minikube image load task-manager:1.0
```

Verify:

```bash
minikube image ls | grep task-manager
```

---

# 18. Kubernetes Deployment

The project contains:

```text
k8s/deployment.yaml
```

Apply the Deployment:

```bash
kubectl apply -f k8s/deployment.yaml
```

Check Deployment:

```bash
kubectl get deployments
```

Check Pods:

```bash
kubectl get pods
```

The Deployment is configured for:

```text
2 replicas
```

Therefore, normally two Pods should be created.

---

# 19. Kubernetes Service

Apply the Service:

```bash
kubectl apply -f k8s/service.yaml
```

Check Services:

```bash
kubectl get services
```

The project uses a `NodePort` Service.

Get detailed Service information:

```bash
kubectl describe service task-manager-service
```

---

# 20. Complete Kubernetes Deployment

From the project directory:

```bash
cd ~/Student-Task-Manager-Web-Application
```

Build Docker image:

```bash
docker build -t task-manager:1.0 .
```

Start Minikube:

```bash
minikube start
```

Load image:

```bash
minikube image load task-manager:1.0
```

Apply Deployment:

```bash
kubectl apply -f k8s/deployment.yaml
```

Apply Service:

```bash
kubectl apply -f k8s/service.yaml
```

Check Pods:

```bash
kubectl get pods
```

Check Service:

```bash
kubectl get service task-manager-service
```

---

# 21. Open Kubernetes Application

The easiest method with Minikube is:

```bash
minikube service task-manager-service --url
```

This displays a URL.

Open that URL in the browser.

You can also run:

```bash
minikube service task-manager-service
```

---

# 22. Kubernetes Debugging Commands

Check Pods:

```bash
kubectl get pods
```

Detailed Pod information:

```bash
kubectl describe pod <POD_NAME>
```

View Pod logs:

```bash
kubectl logs <POD_NAME>
```

Check Deployment:

```bash
kubectl describe deployment task-manager-deployment
```

Check Service:

```bash
kubectl describe service task-manager-service
```

Check all resources:

```bash
kubectl get all
```

---

# 23. Update Kubernetes Application

After changing the application:

```bash
docker build -t task-manager:1.0 .
```

Load the new image into Minikube:

```bash
minikube image load task-manager:1.0
```

Restart the Deployment:

```bash
kubectl rollout restart deployment task-manager-deployment
```

Check rollout:

```bash
kubectl rollout status deployment task-manager-deployment
```

Check Pods:

```bash
kubectl get pods
```

---

# 24. Delete Kubernetes Resources

Delete the Service:

```bash
kubectl delete -f k8s/service.yaml
```

Delete the Deployment:

```bash
kubectl delete -f k8s/deployment.yaml
```

Or delete both:

```bash
kubectl delete -f k8s/
```

Check:

```bash
kubectl get all
```

---

# 25. Stop Minikube

```bash
minikube stop
```

Start it again:

```bash
minikube start
```

Delete the Minikube cluster completely:

```bash
minikube delete
```

---

# 26. Complete Command Sequence

This is the main sequence to run the project using Git, Docker, Jenkins and Kubernetes.

## Step 1: Go to Project

```bash
cd ~/Student-Task-Manager-Web-Application
```

## Step 2: Check Files

```bash
ls
```

## Step 3: Git

```bash
git status
git add .
git commit -m "Update project"
git push
```

## Step 4: Build Docker Image

```bash
docker build -t task-manager:1.0 .
```

## Step 5: Test Docker

```bash
docker run -d --name task-manager-container -p 3000:80 task-manager:1.0
```

Open:

```text
http://localhost:3000
```

Stop the test container:

```bash
docker stop task-manager-container
docker rm task-manager-container
```

## Step 6: Start Kubernetes

```bash
minikube start
```

## Step 7: Load Image

```bash
minikube image load task-manager:1.0
```

## Step 8: Deploy

```bash
kubectl apply -f k8s/deployment.yaml
kubectl apply -f k8s/service.yaml
```

## Step 9: Check

```bash
kubectl get deployments
kubectl get pods
kubectl get services
```

## Step 10: Open Application

```bash
minikube service task-manager-service --url
```

---

# 27. Jenkins + Docker + Kubernetes Flow

The overall deployment flow is:

```text
Developer
   |
   v
Git
   |
   v
GitHub
   |
   v
Jenkins
   |
   +---- npm install
   |
   +---- npm run build
   |
   +---- docker build
   |
   v
Docker Image
   |
   v
Kubernetes / Minikube
   |
   v
Deployment
   |
   v
Pods
   |
   v
Service
   |
   v
Student Task Manager Web Application
```

---

# 28. Common Problems

## Problem: Jenkins service configuration changed

Run:

```bash
sudo systemctl daemon-reload
sudo systemctl restart jenkins
sudo systemctl status jenkins
```

---

## Problem: Docker permission denied

Try:

```bash
sudo docker ps
```

To allow your user to run Docker without `sudo`:

```bash
sudo usermod -aG docker $USER
```

Then log out and log back in.

Check:

```bash
docker ps
```

---

## Problem: Docker container is not running

Check:

```bash
docker ps -a
```

View logs:

```bash
docker logs task-manager-container
```

---

## Problem: Kubernetes Pod is not starting

Run:

```bash
kubectl get pods
```

Then:

```bash
kubectl describe pod <POD_NAME>
```

Check events at the bottom of the output.

---

## Problem: ImagePullBackOff

If using Minikube with a locally built image:

```bash
minikube image load task-manager:1.0
```

Then restart:

```bash
kubectl rollout restart deployment task-manager-deployment
```

---

## Problem: Kubernetes application is not opening

Check:

```bash
kubectl get pods
kubectl get services
```

Then:

```bash
minikube service task-manager-service --url
```

---

## Problem: Port confusion

Docker uses:

```text
Host:3000 -> Container:80
```

because the Node.js server listens on port `80` inside the container.

Kubernetes uses:

```text
Service port: 3000 -> Pod port: 80
```

This matches the project's `service.yaml`.

---

# 29. Final Verification

Run:

```bash
git status
```

```bash
docker images
```

```bash
docker ps
```

```bash
sudo systemctl status jenkins
```

```bash
minikube status
```

```bash
kubectl get deployments
```

```bash
kubectl get pods
```

```bash
kubectl get services
```

If the Pods show `Running` and the Service exists, open the application using:

```bash
minikube service task-manager-service --url
```

---

# 30. Useful Commands Cheat Sheet

| Tool | Command | Purpose |
|---|---|---|
| Git | `git status` | Check Git status |
| Git | `git add .` | Add files |
| Git | `git commit -m "message"` | Commit changes |
| Git | `git push` | Push to GitHub |
| Git | `git pull` | Pull from GitHub |
| Docker | `docker build -t task-manager:1.0 .` | Build image |
| Docker | `docker images` | List images |
| Docker | `docker ps` | List running containers |
| Docker | `docker run -d -p 3000:80 task-manager:1.0` | Run container |
| Docker | `docker stop <container>` | Stop container |
| Jenkins | `sudo systemctl start jenkins` | Start Jenkins |
| Jenkins | `sudo systemctl restart jenkins` | Restart Jenkins |
| Jenkins | `sudo systemctl status jenkins` | Check Jenkins |
| Kubernetes | `kubectl get nodes` | Check nodes |
| Kubernetes | `kubectl get pods` | Check Pods |
| Kubernetes | `kubectl get services` | Check Services |
| Kubernetes | `kubectl apply -f k8s/` | Deploy Kubernetes files |
| Kubernetes | `kubectl delete -f k8s/` | Delete Kubernetes resources |
| Minikube | `minikube start` | Start cluster |
| Minikube | `minikube stop` | Stop cluster |
| Minikube | `minikube status` | Check cluster |
| Minikube | `minikube service task-manager-service --url` | Open application |

---

## Project Technology Stack

- HTML
- CSS
- JavaScript
- Node.js / npm
- Node.js HTTP server
- Docker
- Jenkins
- Kubernetes
- Minikube
- Git
- GitHub
