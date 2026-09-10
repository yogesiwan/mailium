# Mailium

A self-hosted email campaign management application modeled after Mailmeteor, built around cold-emailing workflows, recipient filtering, campaign templates, scheduling, follow-ups, and Gmail integration.

## Application

Mailium is a full-stack application with a React/Vite frontend and a Node.js/Express backend.

### Backend

- Node.js + Express
- MongoDB + Mongoose
- Gmail API + Nodemailer (OAuth2)
- Agenda.js for MongoDB-backed background jobs

### Frontend

- React + Vite
- React Router
- TipTap rich-text editor
- Lucide React

The application includes campaign management, campaign details, analytics/reporting, templates, settings, recipient selection/import, attachments, test emails, scheduling, follow-ups, and Google integrations.

## Deployment Evolution

Mailium started as a rootless Docker Compose deployment and was subsequently reproduced on a self-managed Kubernetes cluster as a platform-engineering experiment.

```text
Docker Compose baseline
        |
        v
Self-managed Kubernetes (kubeadm)
        |
        +-- containerd
        +-- Calico CNI
        +-- Metrics Server
        +-- Horizontal Pod Autoscaler
        +-- AWS Load Balancer Controller
        +-- AWS ALB + ACM TLS
```

The Kubernetes environment is intentionally documented as a learning/portfolio deployment rather than being presented as a production-grade highly available cluster.

## Kubernetes Architecture

```text
                        Internet
                           |
                    mailiumk8.yogeshsiwan.xyz
                           |
                    AWS Application LB
                    HTTP :80 -> HTTPS :443
                           |
                    ACM TLS termination
                           |
                    NodePort :32341
                           |
                 +---------+---------+
                 |                   |
             EC2 m1             EC2 m2
          control plane          worker
                 |                   |
                 +---------+---------+
                           |
                    cache-router
                    Service :8080
                           |
                 +---------+---------+
                 |                   |
          cache-router Pods   cache-runtime Service
                                   :5001
                                       |
                                cache-runtime Pod
                                       |
                              MongoDB / Gmail APIs
```

### Kubernetes stack

- Kubernetes bootstrapped with `kubeadm`
- Ubuntu EC2 nodes in AWS `eu-north-1`
- `containerd` as the container runtime
- Calico CNI for pod networking
- AWS Load Balancer Controller for ALB provisioning
- AWS Application Load Balancer for public ingress
- AWS Certificate Manager (ACM) for TLS
- Metrics Server for resource metrics
- Horizontal Pod Autoscaler for backend CPU-based scaling

### Traffic flow

Public traffic reaches only the `cache-router` service. The router serves the built frontend and reverse-proxies backend paths to the internal `cache-runtime` service.

```text
HTTPS :443
   |
   v
AWS ALB
   |
   v
NodePort :32341
   |
   v
cache-router :8080
   |
   +---- /              -> React frontend
   +---- /api/           -> cache-runtime :5001
   +---- /t/             -> cache-runtime :5001
   +---- /uploads/       -> cache-runtime :5001
   +---- /health         -> cache-runtime :5001
```

`cache-runtime` remains a `ClusterIP` service and is not directly exposed through the ALB.

## Autoscaling

The backend uses an `autoscaling/v2` Horizontal Pod Autoscaler with:

- minimum replicas: 1
- maximum replicas: 10
- CPU target: 50%
- Metrics Server as the metrics source
- CPU requests/limits defined on the backend Deployment

Scale-out and scale-in were verified against live cluster metrics during the Kubernetes deployment work.

## Current Kubernetes Deployment

The main workloads are:

| Workload | Role | Exposure |
|---|---|---|
| `cache-router` | React frontend + Nginx reverse proxy | NodePort behind AWS ALB |
| `cache-runtime` | Express API + Agenda workers | Internal ClusterIP |
| `metrics-server` | Resource metrics | Cluster-internal |
| `aws-load-balancer-controller` | Reconciles Kubernetes ingress with AWS ALB resources | Cluster-internal |

The cluster currently uses two EC2 nodes. The control-plane node is larger than the worker because the control plane and supporting components consume a meaningful amount of memory.

## Local Development

1. Clone the repository.
2. Install backend dependencies:

```bash
cd server
npm install
```

3. Configure the backend environment in `server/.env`.
4. Start the backend:

```bash
npm run dev
```

5. Install and start the frontend:

```bash
cd client
npm install
npm run dev
```

6. Open the Vite development URL shown by the frontend, typically `http://localhost:5173`.

## Documentation

Detailed infrastructure notes are kept under [`docs/`](docs/):

- [`docs/architecture.md`](docs/architecture.md) — application and Kubernetes architecture
- [`docs/kubernetes.md`](docs/kubernetes.md) — kubeadm, containerd, Calico, workloads, and services
- [`docs/aws.md`](docs/aws.md) — EC2, ALB, ACM, networking, and controller integration
- [`docs/autoscaling.md`](docs/autoscaling.md) — Metrics Server and HPA implementation/testing
- [`docs/troubleshooting.md`](docs/troubleshooting.md) — infrastructure issues encountered and how they were resolved

Kubernetes manifests are kept under [`k8s/`](k8s/) as the deployment configuration is captured in the repository.

## Production Baseline

The long-running application deployment remains available as a rootless Docker Compose setup. Kubernetes is documented separately so the repository shows both the original container deployment and the subsequent orchestration work.

For security, real credentials and production `.env` files must never be committed to the repository. Use `.env.example` as the configuration template.
