# CODE-MAP: Rancher 2.14.3 + Harvester 1.8.2 GPU PCI Passthrough

## 1. 아키텍처 및 설계 원칙
- **NVIDIA vGPU 라이선스 미사용**: 물리 GPU (NVIDIA A100, H100, A200, H200, L40S 등) Harvester VM에 1:1 PCI Passthrough 방식으로 연결합니다.
- **MIG 및 컨테이너 관리 위임**: MIG 활성화(`nvidia-smi -mig 1`), 슬라이스 생성 및 NVIDIA Device Plugin(migStrategy=mixed) 배포는 프로비저닝된 RKE2 GPU Worker VM 내부에서 운영자가 직접 수행합니다.
- **영역 국한**: VMware, AWS 등 타 프로바이더에 영향을 주지 않도록 Rancher Dashboard 내 Harvester 전용 머신 드라이버(`pkg/harvester-manager`)에 변경을 집중합니다.

---

## 2. 변경 및 신규 파일 구조

```
dashboard-v2.14.3-gpu/
├── pkg/
│   └── harvester-manager/
│       ├── components/
│       │   └── HarvesterGPUConfig.vue       # [신규] GPU PCI Passthrough UI 컴포넌트
│       ├── machine-config/
│       │   └── harvester.vue                # [수정] Machine Pool 설정 내 GPUConfig 연동, NodeAffinity 및 Label 동기화, 유효성 검증
│       └── l10n/
│           ├── en-us.yaml                   # [수정] GPU 및 PCI 패스스루 영문 로케일 추가
│           └── ko-kr.yaml                   # [수정] GPU 및 PCI 패스스루 국문 로케일 추가
├── shell/
│   ├── config/
│   │   └── types.js                         # [수정] HCI.PCI_DEVICE, HCI.PCI_CLAIM 스키마 상수 등록
│   └── models/
│       └── rke-machine-config.cattle.io.harvesterconfig.js # [수정] 머신 풀 복제(applyDefaults) 시 gpuInfo 상속 방지
└── CODE-MAP.md                              # [신규] 아키텍처 및 구현 명세 문서
```

---

## 3. 핵심 컴포넌트 및 기능 구현 상세

### 3.1 HarvesterGPUConfig.vue (`pkg/harvester-manager/components/HarvesterGPUConfig.vue`)
- **Enable GPU Toggle**: 머신 풀에서 GPU 활성화 여부 지정
- **GPU Model Selection**: 다양한 NVIDIA GPU 모델 프리셋(A100, H100, A200, H200, L40S, L4, A30, V100 등) 지원 및 검색/직접 입력(`taggable`) 지원
- **PCI Passthrough Checkbox**: 물리 GPU 전용 패스스루 활성화 (기본 true)
- **PCI Device Discovery & Enable Passthrough 필터링**:
  - Harvester API (`devices.harvesterhci.io.pcidevice` 및 `devices.harvesterhci.io.pcideviceclaim`)를 연계 조회.
  - Harvester 상에서 `Enable Passthrough`가 설정되어 Claim이 바인딩되고 `status.passthroughEnabled === true`인 **패스스루 활성화 장치만 기본 필터링**하여 드롭다운에 노출.
  - 'Show only Passthrough-Enabled devices' 체크박스를 통해 상태별 확인 가능.
  - 패스스루 준비된 GPU가 없을 시 Harvester UI 안내 배너 노출 및 미활성화 장치 선택 시 유효성 검사 차단.
  - 장치 설명에서 GPU 모델(A100, H100, A200, H200 등) 자동 감지 및 오프라인/테스트용 데모 장치 지원.
- **Harvester Node Affinity**: 선택된 PCI 장치가 상주하는 물리 노드(`hci01`)를 감지하고 VM 스케줄링(`kubernetes.io/hostname`)에 자동 주입
- **Kubernetes Node Label 주입**:
  - `accelerator=nvidia-<model>` (예: `nvidia-a100`, `nvidia-h100`, `nvidia-a200`, `nvidia-h200` 등)
  - `gpu.vendor=nvidia`
  - `gpu.model=<model>` (예: `a100`, `h100`, `a200`, `h200` 등)
  - `gpu.passthrough=true`
- **GPU Configuration Preview (PRD Section 20)**: 클러스터 생성 전 GPU 모델, PCI 주소, 호스트 노드, vGPU 미사용 안내 문구 요약 카드 표시
- **Validation (PRD Section 15)**:
  - PCI 디바이스 필수 선택 검사
  - 1 GPU : 1 VM 원칙에 따른 머신 풀 `quantity > 1` 경고 및 에러 차단

### 3.2 harvester.vue (`pkg/harvester-manager/machine-config/harvester.vue`)
- `HarvesterGPUConfig` 컴포넌트 임베드 (CPU/Memory 설정과 Volume 설정 사이)
- `this.value.gpuInfo` JSON 직렬화 저장
- PCI 디바이스 선택 시 Harvester `nodeAffinity`로 자동 매핑
- MachinePool의 `pool.labels`에 GPU 레이블 자동 반영
- `test()` 메서드 실행 시 GPU 유효성 검사 수행

### 3.3 머신 풀 역할(Role) 격리 및 유효성 검증 (Multi-Pool Isolation)
- **Control Plane/etcd 전용 풀 GPU 비활성화**:
  - `machinePool.pool.workerRole === false`인 마스터 풀의 경우 GPU 설정을 비활성화하고 안내 배너 노출.
  - 마스터 풀에서 워커 역할을 해제할 때 GPU 설정 자동 해제(`onToggleEnable(false)`).
  - 유효성 검사(`validate()`) 시 마스터 풀은 검사 제외(pass)하여 클러스터 생성 차단 방지.
- **머신 풀 식별 에러 메시지**:
  - 에러 메시지에 `[${ poolName }]` 접두사(예: `[pool-worker] GPU 패스스루를 위해...`)를 부착하여 어떤 머신 풀에서 검증 오류가 발생했는지 명확히 식별 가능.
- **머신 풀 간 독립성 보장**:
  - `HciMachineConfig.applyDefaults`에서 새 머신 풀 추가 시 `gpuInfo` 상속을 방지하여 물리 GPU 중복 할당 방지.

---

## 4. 데이터 모델 (PRD Section 10 & 11)

```typescript
interface HarvesterMachinePoolGPU {
  enabled: boolean;
  vendor: 'nvidia';
  model: 'A100';
  pciPassthrough: boolean;
  pciDevice?: {
    name: string;        // 예: pci-0000-41-00-0
    address: string;     // 예: 0000:41:00.0
    nodeName: string;    // 예: hci01
    vendorId: string;    // 예: 10de
    deviceId: string;    // 예: 20b0
    description: string; // 예: NVIDIA A100 PCIe 40GB
  };
  nodeLabels: {
    'accelerator':     'nvidia-a100';
    'gpu.vendor':      'nvidia';
    'gpu.model':       'a100';
    'gpu.passthrough': 'true';
  };
}
```


### 6. Node Label Synchronization and Machine Pool Scoping (2026-10-01)
- **Problem**: When creating a multi-pool cluster (e.g. Master and Worker pools), GPU node labels were erroneously remaining on Master nodes (Control Plane/etcd) while Worker nodes lacked them.
- **Root Causes**:
  1. `updateGpuLabels` accessed `this.machinePools?.[this.poolIndex]?.pool` by array index instead of resolving the exact pool by config identity (`p.config === this.value` / `this.poolId`).
  2. When Worker role was toggled off or GPU was unchecked on Master pool, existing GPU labels in `pool.labels` were never deleted (`Object.assign` only merges, never deletes).
  3. Worker pool lacked a `mounted()` hook in `HarvesterGPUConfig.vue` to automatically push labels when initialized.
- **Resolution**:
  - `pkg/harvester-manager/machine-config/harvester.vue`:
    - Added `currentMachinePool` and `currentPool` computed properties with config-based matching.
    - Updated `updateGpuLabels` to explicitly delete `accelerator`, `gpu.vendor`, `gpu.model`, `gpu.passthrough` before assigning.
    - Updated `test()` validation to enforce label consistency right before submission (purging GPU labels from non-worker/GPU-disabled pools, and injecting expected labels into GPU-enabled worker pools).
  - `pkg/harvester-manager/components/HarvesterGPUConfig.vue`:
    - Added `mounted()` hook to trigger label/scheduling emissions when mounted with GPU enabled.
    - Emitted `update:labels` with `{}` on `onToggleEnable(false)` and `workerRole` watchers.

---

## 7. Backend: docker-machine-driver-harvester (v1.0.6) 연동 및 빌드

### 7.1 문제 배경 및 필수성
- Rancher Dashboard UI에서 아무리 `gpu.passthrough=true` 레이블을 부여하더라도, 이는 RKE2 등록 후의 쿠버네티스 노드 메타데이터일 뿐입니다.
- 실제 KubeVirt VM에 물리 GPU를 장착하기 위해서는 VM Spec의 `spec.template.spec.domain.devices.hostDevices`에 PCI 장치가 주입되어야 합니다.
- 이를 수행하는 주체가 Rancher의 프로비저닝 에이전트인 `docker-machine-driver-harvester`입니다.

### 7.2 드라이버 (v1.0.6) 구현 내역
1. **플래그 및 데이터 구조 확장**:
   - `harvester-gpu-info` CLI 플래그 및 `HARVESTER_GPU_INFO` 환경변수 추가.
   - `GPUInfo`, `GPUPCIDevice` 구조체 추가 및 JSON 역직렬화 로직 구현.
2. **KubeVirt HostDevice 주입**:
   - `d.ConfigureGPU(vmBuilder)` 메서드를 통해 VM 생성 시 `vmBuilder.HostDevice(name, resourceName, "")` 자동 호출.
   - Harvester v1.8.2 KubeVirt VM Spec의 `domain.devices.hostDevices`에 정확히 매핑.
3. **물리 노드 스케줄링 보장**:
   - GPU 장치가 위치한 Harvester 물리 노드(`nodeName`)로 `kubernetes.io/hostname` Node Affinity 자동 주입.
4. **단위 테스트**:
   - `Test_parseGPUInfo` 추가 및 전체 유닛 테스트 PASS 검증.

### 7.3 빌드 아티팩트
- 소스 경로: `/home/ubuntu/harvester/machine-driver/docker-machine-driver-harvester-v1.0.6`
- 브랜치: `feat/gpu-pci-passthrough`
- 빌드 결과물:
  - `bin/docker-machine-driver-harvester-amd64` (62MB)
  - `bin/docker-machine-driver-harvester-arm64` (59MB)

### 7.4 Rancher 적용 방법 (Node Driver 교체)
1. Rancher UI 접속 > **Cluster Management** > **Drivers** > **Node Drivers** 이동.
2. `harvester` 드라이버 선택 후 **Edit**.
3. 빌드된 `docker-machine-driver-harvester-amd64`의 다운로드 URL 및 SHA256 체크섬을 입력하고 저장하거나, Rancher Server 파드의 노드 드라이버 바이너리를 직접 교체합니다.
