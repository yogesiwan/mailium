<div align="center">

# Mailium

**Self-hosted email campaign management — bulk sending, scheduling, and open/reply tracking. Deployable via Docker Compose or a self-managed Kubernetes cluster.**

[![Kubernetes](https://img.shields.io/badge/Kubernetes-1.36-326CE5?style=flat-square&logo=kubernetes&logoColor=white)](https://kubernetes.io/)
[![AWS](https://img.shields.io/badge/AWS-EC2%20%7C%20ALB%20%7C%20ACM-232F3E?style=flat-square&logo=amazonaws&logoColor=white)](https://aws.amazon.com/)
[![Docker](https://img.shields.io/badge/Docker-Compose-2496ED?style=flat-square&logo=docker&logoColor=white)](https://www.docker.com/)
[![Node.js](https://img.shields.io/badge/Node.js-20-339933?style=flat-square&logo=node.js&logoColor=white)](https://nodejs.org/)
[![React](https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react&logoColor=111111)](https://react.dev/)

[**Live application**](https://mailium.yogeshsiwan.xyz) · [**Getting Started**](#getting-started) · [**Architecture**](docs/architecture.md) · [**Kubernetes**](docs/kubernetes.md) · [**AWS**](docs/aws.md) · [**Autoscaling**](docs/autoscaling.md) · [**Troubleshooting**](docs/troubleshooting.md)

</div>

---

## What is Mailium?

Mailium is a self-hosted email campaign management application for bulk email sending, scheduled campaigns, and tracking opens and replies.

It covers the full campaign workflow — importing and filtering recipients, composing rich-text emails, reusable templates, attachments, paced/scheduled sending, and follow-up sequences — all through your own Gmail account via OAuth.

### Why I built it

I wanted to send cold emails without blasting an entire list at once, and I wanted visibility into who opened an email or replied to it, without paying for a full sales/marketing platform just to get that.

I looked at tools like Mailmeteor and Mailchimp first. Some had the features I needed locked behind paid tiers, others had free plans with limits that didn't work for what I was doing. So I built Mailium for my own cold-emailing workflow. If you have a similar use case — bulk sending, open/reply tracking, follow-up sequences — it might be useful for you too.

## Features

- Bulk email sending with pacing control
- Scheduled campaigns and autopilot-style settings
- Open tracking
- Reply tracking and same-thread follow-up sequences
- Recipient import, filtering, and exclusions
- Rich-text email composition
- Reusable campaign templates
- Attachments and test emails
- Gmail OAuth integration for sending
- Campaign detail and analytics/reporting

## Getting started

### Try the hosted version

- **[mailium.yogeshsiwan.xyz](https://mailium.yogeshsiwan.xyz)** — the primary hosted instance, running on the Docker Compose deployment.
- **[mailiumk8.yogeshsiwan.xyz](https://mailiumk8.yogeshsiwan.xyz)** — the Kubernetes deployment described in this README.

### Self-host with Docker Compose

The simplest way to run Mailium on a single server. The stack is two containers:

| Container | Role |
|---|---|
| `cache-router` | Nginx + the React/Vite frontend. The single public-facing entry point. |
| `cache-runtime` | Node.js/Express backend. Handles sending, tracking, scheduling, and the database connection. |

Steps:

1. Clone the repository and copy `.env.example` to `.env`, then fill in your database connection and Google/Gmail OAuth credentials.
2. Start the stack:
   ```bash
   docker compose up -d --build
   ```

TLS is optional at this layer — configure it if you're exposing the app publicly, skip it for local or internal use.

### Self-host with Kubernetes

This is how [mailiumk8.yogeshsiwan.xyz](https://mailiumk8.yogeshsiwan.xyz) above is deployed: a self-managed cluster (`kubeadm` + `containerd` + Calico) behind an AWS Application Load Balancer with ACM TLS, with CPU-based Horizontal Pod Autoscaling on the backend — tested through both scale-out and scale-in.

It's a more involved setup than Docker Compose since it requires a cluster, Services, ingress, secrets, and autoscaling to be configured. Full walkthrough: **[Kubernetes deployment](docs/kubernetes.md)**.

## Architecture

This diagram shows the Kubernetes deployment topology used for Mailium: the self-managed cluster behind the AWS ALB, described above. The public entry point is the router layer — the backend stays an internal `ClusterIP` service, so application traffic never reaches the API directly from the internet. (The Docker Compose deployment uses the same two-tier frontend/backend split, without the Kubernetes/AWS layer around it.)

```mermaid
flowchart TB
    user([Internet User]) --> dns["DNS · GoDaddy<br/>mailiumk8.yogeshsiwan.xyz"]
    dns --> alb["AWS Application Load Balancer<br/>ACM TLS :443 · HTTP→HTTPS redirect"]
    alb --> tg["Target Group :32341<br/>EC2 instance targets (m1, m2)"]

    subgraph cluster["Self-managed Kubernetes Cluster · kubeadm + containerd + Calico"]
        tg -->|"NodePort 32341 → Service :8080"| gwSvc["cache-router Service<br/>NodePort · public entry point"]

        gwSvc --> gw1["cache-router pod<br/>Nginx + React/Vite static build"]
        gwSvc --> gw2["cache-router pod<br/>Nginx + React/Vite static build"]

        gw1 -->|"/api /t /uploads /health"| engSvc["cache-runtime Service<br/>ClusterIP :5001 · internal only"]
        gw2 -->|"/api /t /uploads /health"| engSvc

        engSvc --> e1["cache-runtime pod<br/>Express + Mongoose + Agenda"]
        engSvc --> e2["cache-runtime pod<br/>HPA scaled"]
        engSvc --> e3["cache-runtime pod<br/>HPA scaled"]
        engSvc --> e4["cache-runtime pod<br/>HPA scaled"]
        engSvc --> e5["cache-runtime pod<br/>HPA scaled"]
        engSvc --> e6["cache-runtime pod<br/>HPA scaled"]
        engSvc --> e7["cache-runtime pod<br/>HPA scaled"]

        metrics["Metrics Server"] -. metrics .-> hpa["HPA · cache-runtime<br/>min 1 / max 10 replicas<br/>CPU target 50%<br/>(scaled-out state shown)"]
        hpa -. scales .-> engSvc
        lbc["AWS Load Balancer Controller"] -. reconciles .-> alb
        calico["Calico CNI"] -. pod networking .-> gw1
        calico -. pod networking .-> e1
    end

    e1 --> mongo[("MongoDB<br/>Mongoose ODM · Agenda job store")]
    e1 --> gmail["Gmail API<br/>OAuth2 · Nodemailer · reply sync"]
    e1 --> sheets["Google Sheets API<br/>recipient import"]

    classDef public fill:#0969DA,color:#fff,stroke:#0969DA
    classDef aws fill:#232F3E,color:#fff,stroke:#232F3E
    classDef k8s fill:#326CE5,color:#fff,stroke:#326CE5
    classDef app fill:#1a7f37,color:#fff,stroke:#1a7f37
    classDef scaled fill:#e6f4ea,color:#1a7f37,stroke:#1a7f37,stroke-width:1px,stroke-dasharray:4 3
    classDef data fill:#8250df,color:#fff,stroke:#8250df

    class user,dns public
    class alb,tg,lbc aws
    class gwSvc,engSvc,metrics,hpa,calico k8s
    class gw1,gw2,e1 app
    class e2,e3,e4,e5,e6,e7 scaled
    class mongo,gmail,sheets data
```

### Request flow

```text
Client
  │
  ├── HTTP :80 ──► ALB ──► 301 redirect to HTTPS
  │
  └── HTTPS :443 ─► ALB ─► ACM TLS termination
                         │
                         ▼
                  NodePort :32341
                         │
                         ▼
               cache-router :8080 (Nginx)
                         │
              ┌──────────┴──────────┐
              ▼                     ▼
        React frontend        /api /t /uploads /health
                                    │
                                    ▼
                   cache-runtime :5001 (Express)
                                    │
                         ┌──────────┴──────────┐
                         ▼                     ▼
                     MongoDB              Google APIs
```

### Autoscaling

The backend (`cache-runtime`) scales on CPU via a standard `autoscaling/v2` HPA:

```yaml
minReplicas: 1
maxReplicas: 10
metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 50
```

Metrics Server feeds the resource metrics the HPA reads. Under sustained load the backend scaled from 1 replica up to the configured max of 10, then scaled back down once load stopped. Full test method and results: **[Autoscaling documentation](docs/autoscaling.md)**.

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

## Documentation

The README covers the high-level picture. Implementation and infrastructure detail is documented separately so it doesn't turn this file into an installation manual:

- **[Architecture](docs/architecture.md)** — application boundaries, request flow, and deployment model
- **[Kubernetes](docs/kubernetes.md)** — kubeadm, containerd, Calico, workloads, Services, probes, and cluster layout
- **[AWS](docs/aws.md)** — EC2, networking, Load Balancer Controller, ALB, ACM, and security groups
- **[Autoscaling](docs/autoscaling.md)** — Metrics Server, HPA configuration, load testing, and verified scale-out/scale-in
- **[Troubleshooting](docs/troubleshooting.md)** — real infrastructure failures and the fixes used during the build

## Screenshots

Since the Kubernetes cluster and its AWS resources are temporary, screenshots live under `docs/evidence/` (referenced from the relevant docs page) so the results outlive the cluster itself. Planned coverage:

- **Cluster** — nodes, workloads, and pod scheduling across both EC2 instances
- **Load balancing & TLS** — ALB target group health, ACM certificate status, HTTPS access in the browser
- **Autoscaling** — `kubectl get hpa -w` and pod count during a load test, plus the scale-in afterward
- **Load test** — the load-testing tool's command and summary output (requests/sec, latency, duration)

## Security notes

- Never commit real credentials or production `.env` files.
- Use `.env.example` as the configuration template.
- The current Kubernetes node security-group configuration was intentionally permissive during the learning phase and should be hardened before treating the cluster as a production deployment.
- IAM for the AWS Load Balancer Controller currently relies on the EC2 node instance role; workload identity such as IRSA/Pod Identity is a future hardening improvement.

## Status

`mailium.yogeshsiwan.xyz` (Docker Compose) is the durable, long-running deployment. `mailiumk8.yogeshsiwan.xyz` (Kubernetes) is an actively documented infrastructure experiment — its AWS resources may be temporary, but the repository preserves the architecture, manifests, screenshots, and lessons learned after the cluster is eventually decommissioned.

---

<div align="center">

**Mailium**
</div>