<div align="center">

# Mailium

**Self-hosted email campaign management with a full-stack application and a self-managed Kubernetes deployment.**

[![Kubernetes](https://img.shields.io/badge/Kubernetes-1.36-326CE5?style=flat-square&logo=kubernetes&logoColor=white)](https://kubernetes.io/)
[![AWS](https://img.shields.io/badge/AWS-EC2%20%7C%20ALB%20%7C%20ACM-232F3E?style=flat-square&logo=amazonaws&logoColor=white)](https://aws.amazon.com/)
[![Docker](https://img.shields.io/badge/Docker-Compose-2496ED?style=flat-square&logo=docker&logoColor=white)](https://www.docker.com/)
[![Node.js](https://img.shields.io/badge/Node.js-20-339933?style=flat-square&logo=node.js&logoColor=white)](https://nodejs.org/)
[![React](https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react&logoColor=111111)](https://react.dev/)

[**Live application**](https://mailiumk8.yogeshsiwan.xyz) · [**Architecture**](docs/architecture.md) · [**Kubernetes**](docs/kubernetes.md) · [**AWS**](docs/aws.md) · [**Autoscaling**](docs/autoscaling.md) · [**Troubleshooting**](docs/troubleshooting.md)

</div>

---

## Overview

Mailium is a self-hosted email campaign management application modeled after Mailmeteor. It provides a workflow for creating campaigns, importing and filtering recipients, composing rich-text messages, using templates, attaching files, scheduling sends, and managing follow-ups through Gmail integrations.

The project also serves as a practical platform-engineering exercise: an application originally deployed with rootless Docker Compose was reproduced on a **self-managed Kubernetes cluster bootstrapped with kubeadm**, then exposed through an AWS Application Load Balancer with ACM TLS and configured with CPU-based Horizontal Pod Autoscaling.

> **Project scope:** the Kubernetes environment is a portfolio/learning deployment. It demonstrates the implemented architecture and operational work without claiming production-grade high availability or security hardening that has not been implemented.

## Architecture

The public entry point is the router layer. The backend remains an internal `ClusterIP` service, so application traffic is not sent directly to the API from the internet.

```mermaid
flowchart TB
    user([Internet]) --> dns[mailiumk8.yogeshsiwan.xyz]
    dns --> alb[AWS Application Load Balancer]
    alb -->|HTTPS :443| tls[ACM TLS termination]
    alb -->|HTTP :80 redirects| tls
    tls --> nodeport[NodePort :32341]

    subgraph cluster[Self-managed Kubernetes cluster]
        nodeport --> routerSvc[cache-router Service :8080]
        routerSvc --> router1[cache-router Pod]
        routerSvc --> router2[cache-router Pod]

        router1 -->|/api /t /uploads /health| runtimeSvc[cache-runtime ClusterIP :5001]
        router2 -->|/api /t /uploads /health| runtimeSvc
        runtimeSvc --> runtime[cache-runtime Pod]

        metrics[Metrics Server] -. metrics .-> runtime
        hpa[HPA: 1-10 replicas, CPU 50%] -. scales .-> runtime
        lbc[AWS Load Balancer Controller] -. reconciles .-> alb
        calico[Calico CNI] -. pod networking .-> router1
        calico -. pod networking .-> runtime
    end

    runtime --> mongo[(MongoDB)]
    runtime --> google[Google APIs]

    classDef public fill:#0969DA,color:#fff,stroke:#0969DA
    classDef aws fill:#232F3E,color:#fff,stroke:#232F3E
    classDef k8s fill:#326CE5,color:#fff,stroke:#326CE5
    classDef app fill:#1a7f37,color:#fff,stroke:#1a7f37
    classDef data fill:#8250df,color:#fff,stroke:#8250df

    class user,dns public
    class alb,tls aws
    class nodeport,routerSvc,runtimeSvc,metrics,hpa,lbc,calico k8s
    class router1,router2,runtime app
    class mongo,google data
```

### Request path

```text
Client
  │
  ├── HTTP :80 ──► ALB ──► 301 HTTPS redirect
  │
  └── HTTPS :443 ─► ALB ─► ACM TLS termination
                         │
                         ▼
                    NodePort :32341
                         │
                         ▼
                  cache-router :8080
                         │
              ┌──────────┴──────────┐
              │                     │
         React frontend      /api /t /uploads /health
                                    │
                                    ▼
                         cache-runtime :5001
                                    │
                         ┌──────────┴──────────┐
                         ▼                     ▼
                     MongoDB              Google APIs
```

## What the project demonstrates

| Area | Implementation |
|---|---|
| Application | React/Vite frontend + Node.js/Express backend |
| Containers | Docker + rootless Docker Compose baseline |
| Cluster bootstrap | Kubernetes `kubeadm` |
| Runtime | `containerd` |
| Pod networking | Calico CNI |
| Public ingress | AWS Load Balancer Controller + ALB |
| TLS | AWS Certificate Manager |
| Internal routing | Kubernetes `ClusterIP` + router reverse proxy |
| Metrics | Metrics Server |
| Autoscaling | `autoscaling/v2` HPA, CPU target 50%, 1–10 replicas |
| Cloud platform | AWS EC2, VPC networking, security groups |

## Application capabilities

- Campaign creation and editing
- Recipient selection and CSV-style recipient import
- Recipient exclusions and filtering workflows
- Rich-text email composition
- Reusable campaign templates
- Attachments and test emails
- Scheduled campaigns and autopilot-style settings
- Follow-up sequences and same-thread replies
- Gmail OAuth integration and email sending
- Campaign detail and analytics/reporting surfaces

## Deployment evolution

Mailium has two deployment stories in this repository:

```text
Rootless Docker Compose
        │
        │  application baseline
        ▼
┌───────────────────────┐
│ cache-runtime         │  Express + Agenda
│ cache-router          │  Nginx + React
└───────────────────────┘
        │
        │ migration / reproduction
        ▼
Self-managed Kubernetes
        │
        ├── kubeadm
        ├── containerd
        ├── Calico
        ├── Metrics Server
        ├── HPA
        └── AWS ALB + ACM
```

The Docker Compose deployment remains the long-running application baseline. The Kubernetes environment captures the orchestration and cloud-integration work separately.

## Repository structure

```text
mailium/
├── client/                 # React/Vite frontend
├── server/                 # Node.js/Express backend
├── docs/                   # Architecture and infrastructure documentation
├── k8s/                    # Kubernetes manifests and deployment configuration
├── docker-compose.yml      # Rootless Docker Compose baseline
├── .env.example            # Configuration template
└── README.md
```

## Local development

### Prerequisites

- Node.js 20+
- MongoDB
- Google OAuth credentials for the integrations you want to use

### Backend

```bash
cd server
npm install
```

Create `server/.env` from the required environment variables and start the development server:

```bash
npm run dev
```

The backend listens on port `5001` in the containerized deployment; local development configuration may differ according to the environment file.

### Frontend

```bash
cd client
npm install
npm run dev
```

Vite normally serves the development frontend on port `5173`.

## Kubernetes documentation

The Kubernetes work is documented separately so each layer can be understood without turning the README into an installation manual.

- **[Architecture](docs/architecture.md)** — application boundaries, request flow, and deployment model
- **[Kubernetes](docs/kubernetes.md)** — kubeadm, containerd, Calico, workloads, Services, probes, and cluster layout
- **[AWS](docs/aws.md)** — EC2, networking, Load Balancer Controller, ALB, ACM, and security groups
- **[Autoscaling](docs/autoscaling.md)** — Metrics Server, HPA configuration, load testing, and verified scale-out/scale-in
- **[Troubleshooting](docs/troubleshooting.md)** — real infrastructure failures and the fixes used during the build

## Evidence and screenshots

Operational screenshots will be added under `screenshots/` as the cluster is documented. Planned evidence includes:

- Kubernetes nodes and workloads
- ALB listeners and target health
- ACM certificate status
- HPA scale-out and scale-in
- Metrics Server output
- Public HTTPS application access

## Security notes

- Never commit real credentials or production `.env` files.
- Use `.env.example` as the configuration template.
- The current Kubernetes node security-group configuration was intentionally permissive during the learning phase and should be hardened before treating the cluster as a production deployment.
- IAM for the AWS Load Balancer Controller currently relies on the EC2 node instance role; workload identity such as IRSA/Pod Identity is a future hardening improvement.

## Status

The Kubernetes deployment is an actively documented infrastructure experiment. AWS resources may be temporary, but the repository is intended to preserve the architecture, manifests, evidence, and lessons learned after the cluster is decommissioned.

---

<div align="center">

**Mailium** · Application engineering + Kubernetes + AWS infrastructure

</div>
