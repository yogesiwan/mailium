# Kubernetes manifests

These manifests capture the application-layer Kubernetes configuration used for the Mailium deployment.

## Layout

```text
k8s/
├── namespace.yaml
├── ingress.yaml
├── backend/
│   ├── deployment.yaml
│   ├── service.yaml
│   ├── hpa.yaml
│   └── secret.example.yaml
└── frontend/
    ├── deployment.yaml
    └── service.yaml
```

## Prerequisites

The manifests assume that the cluster already has:

- a working kubeadm Kubernetes cluster;
- containerd;
- Calico CNI;
- Metrics Server;
- AWS Load Balancer Controller;
- a GHCR image-pull secret named `ghcr-secret`;
- a backend Secret named `mailium-backend-env`.

The actual application secrets and registry credentials are intentionally not committed.

## Apply order

Create the namespace and required Secrets first. `secret.example.yaml` is a template and should **not** be applied unchanged.

```bash
kubectl apply -f k8s/namespace.yaml

# Create mailium-backend-env from your real values using your preferred
# secret-management method. Do not commit the resulting Secret manifest.

kubectl apply -f k8s/backend/deployment.yaml
kubectl apply -f k8s/backend/service.yaml
kubectl apply -f k8s/backend/hpa.yaml
kubectl apply -f k8s/frontend/deployment.yaml
kubectl apply -f k8s/frontend/service.yaml
kubectl apply -f k8s/ingress.yaml
```

Before applying to a real cluster, replace the placeholder values in `ingress.yaml` and create the required Secrets separately.

## Verify

```bash
kubectl get all -n mailium
kubectl get ingress -n mailium
kubectl get hpa -n mailium
kubectl top pods -n mailium
```

## Important note

The manifests preserve the implemented application configuration and provide a reproducible starting point. Cloud-specific values such as ACM certificate ARNs, subnet IDs, and registry credentials are deliberately parameterized rather than hard-coded into the repository.
