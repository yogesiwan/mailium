# Troubleshooting

This page records infrastructure problems encountered while building the Mailium Kubernetes environment. The goal is to document the reasoning and fixes, not only the final working state.

## 1. Second node was not participating correctly in AWS integration

### Symptom

The Kubernetes worker node was present, but the AWS Load Balancer Controller could not complete the expected AWS integration.

### Investigation

The second EC2 instance did not initially have the expected IAM instance profile.

### Fix

The same appropriate instance profile used by the cluster nodes was attached to the second node, after which the AWS integration could proceed.

### Lesson

Adding a node to Kubernetes is not sufficient when cloud-controller functionality also depends on AWS instance permissions. Kubernetes state and cloud identity have to agree.

---

## 2. AWS Load Balancer Controller could not use the node security group as expected

### Symptom

The controller's AWS resource reconciliation was blocked by cluster discovery/tagging assumptions.

### Investigation

The shared node security group was missing the expected Kubernetes cluster tag:

```text
kubernetes.io/cluster/kubernetes=owned
```

### Fix

The cluster tag was added to the shared node security group.

### Lesson

Cloud controllers frequently use AWS resource tags as part of discovery and ownership. A Kubernetes object can be correct while the corresponding AWS metadata is incomplete.

---

## 3. Node provider IDs were missing or incorrect

### Symptom

The Kubernetes nodes did not expose the AWS provider identity in the expected form for cloud integration.

### Fix

The kubelet configuration was corrected on the control-plane node and the Kubernetes Node objects were patched with the AWS provider IDs.

The resulting pattern is:

```text
aws:///eu-north-1c/<instance-id>
aws:///eu-north-1a/<instance-id>
```

### Lesson

Cloud-aware Kubernetes components need a reliable mapping between a Kubernetes Node and the underlying cloud instance.

---

## 4. ALB target health versus Kubernetes readiness

### Important distinction

A Kubernetes Pod being `Ready` does not by itself prove that the AWS ALB target is healthy.

There are multiple health layers:

```text
Application endpoint
       │
       ▼
Pod readiness
       │
       ▼
Kubernetes Service / NodePort
       │
       ▼
ALB target health
       │
       ▼
Public request
```

When debugging ingress, check all of them independently.

Useful commands:

```bash
kubectl get pods -n mailium -o wide
kubectl get svc -n mailium
kubectl describe ingress -n mailium cache-router-ingress
```

And from AWS:

```bash
aws elbv2 describe-target-health \
  --region eu-north-1 \
  --target-group-arn <target-group-arn> \
  --output table
```

---

## 5. Router replicas ended up on the same node

### Observation

The intended router deployment has two replicas, but the current Ready replicas are both on m1.

### Why this matters

Two replicas provide process-level redundancy, but if both replicas share one node, a node failure can still remove both replicas.

### Current status

This is documented as a topology limitation. No anti-affinity or topology-spread rule is currently enforced for `cache-router`.

### Improvement

A future manifest can use `podAntiAffinity` or `topologySpreadConstraints` to prefer or require distribution across the two nodes, subject to the small worker's capacity.

---

## 6. Node resource pressure

Earlier in the build, the control-plane node was resource-constrained. Memory and disk/I/O pressure caused instability and evictions.

The control-plane EC2 instance was subsequently upgraded to a larger instance with approximately 8 GiB of memory.

The cluster became stable after the change, but the smaller worker node remains a capacity constraint that should be monitored.

Useful commands:

```bash
kubectl top nodes
kubectl describe node <node-name>
kubectl get events -A --sort-by=.lastTimestamp
```

### Lesson

A small Kubernetes cluster has a fixed infrastructure cost: the control plane, CNI, metrics, ingress controller, and workloads all compete for the same node resources. Pod requests/limits and node sizing have to be considered together.

---

## 7. HPA depended on Metrics Server

### Symptom

CPU-based autoscaling cannot make useful decisions if resource metrics are unavailable.

### Verification

```bash
kubectl top nodes
kubectl top pods -A
kubectl get hpa -n mailium
```

### Result

Metrics Server was installed and verified. HPA scale-out and scale-in were subsequently tested successfully.

### Lesson

For HPA debugging, verify the metrics pipeline before debugging the HPA object itself.

---

## 8. Broken demo HPA left in the cluster

An unrelated `default/nginx-demo` HPA remained from an earlier experiment and referenced a missing Deployment.

Its condition showed a `FailedGetScale` error.

This does not affect Mailium's `mailium/cache-runtime` HPA, but it is cluster hygiene debt and should be removed before final evidence capture.

---

## Debugging order

When public application traffic fails, debug from the outside inward:

```text
1. DNS
   ↓
2. ALB listener
   ↓
3. ACM certificate / TLS
   ↓
4. ALB target health
   ↓
5. NodePort reachability
   ↓
6. Kubernetes Service
   ↓
7. Pod readiness
   ↓
8. Application endpoint
   ↓
9. Database / external API dependency
```

This prevents jumping directly into application logs when the actual failure is in AWS networking or Kubernetes routing.
