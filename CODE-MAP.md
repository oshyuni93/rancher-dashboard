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
│   └── config/
│       └── types.js                         # [수정] HCI.PCI_DEVICE, HCI.PCI_CLAIM 스키마 상수 등록
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
