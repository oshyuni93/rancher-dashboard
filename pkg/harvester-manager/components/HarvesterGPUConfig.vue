<script>
import LabeledSelect from '@shell/components/form/LabeledSelect';
import { LabeledInput } from '@components/Form/LabeledInput';
import { Checkbox } from '@components/Form/Checkbox';
import { Banner } from '@components/Banner';
import Loading from '@shell/components/Loading';
import { HCI } from '@shell/config/types';
import { get, clone } from '@shell/utils/object';
import { _VIEW } from '@shell/config/query-params';

export function getGpuNodeLabels(model = 'A100') {
  const modelLower = (model || 'a100').toLowerCase().replace(/\s+/g, '-').trim();

  return {
    accelerator:       `nvidia-${ modelLower }`,
    'gpu.vendor':      'nvidia',
    'gpu.model':       modelLower,
    'gpu.passthrough': 'true',
  };
}

const GPU_MODELS = [
  {
    label: 'NVIDIA A100', value: 'A100', vendor: 'nvidia'
  },
  {
    label: 'NVIDIA H100', value: 'H100', vendor: 'nvidia'
  },
  {
    label: 'NVIDIA A200', value: 'A200', vendor: 'nvidia'
  },
  {
    label: 'NVIDIA H200', value: 'H200', vendor: 'nvidia'
  },
  {
    label: 'NVIDIA L40S', value: 'L40S', vendor: 'nvidia'
  },
  {
    label: 'NVIDIA L4', value: 'L4', vendor: 'nvidia'
  },
  {
    label: 'NVIDIA A30', value: 'A30', vendor: 'nvidia'
  },
  {
    label: 'NVIDIA V100', value: 'V100', vendor: 'nvidia'
  },
];

export default {
  name: 'HarvesterGPUConfig',

  components: {
    Checkbox,
    LabeledSelect,
    LabeledInput,
    Banner,
    Loading,
  },

  props: {
    mode: {
      type:    String,
      default: 'create',
    },

    disabled: {
      type:    Boolean,
      default: false,
    },

    value: {
      type:    Object,
      default: () => ({
        enabled:        false,
        vendor:         'nvidia',
        model:          'A100',
        pciPassthrough: true,
        pciDevice:      null,
        nodeLabels:     getGpuNodeLabels('A100'),
      }),
    },

    credential: {
      type:    Object,
      default: null,
    },

    machinePool: {
      type:    Object,
      default: () => ({}),
    },

    poolIndex: {
      type:    Number,
      default: 0,
    },

    machinePools: {
      type:    Array,
      default: () => [],
    },
  },

  emits: ['update:value', 'update:nodeScheduling', 'update:labels'],

  data() {
    return {
      loadingDevices:     false,
      pciDevices:         [],
      pciClaims:          [],
      harvesterVms:       [],
      gpuModels:          GPU_MODELS,
      selectedDeviceName: this.value?.pciDevice?.name || '',
      manualDeviceInput:  false,
      manualAddress:      this.value?.pciDevice?.address || '',
      manualNode:         this.value?.pciDevice?.nodeName || '',
    };
  },

  computed: {
    isView() {
      return this.mode === _VIEW;
    },

    quantity() {
      return this.machinePool?.pool?.quantity || 1;
    },

    currentModel() {
      return this.value?.model || 'A100';
    },

    currentNodeLabels() {
      return this.value?.nodeLabels || getGpuNodeLabels(this.currentModel);
    },

    // Map of devices currently allocated to any existing Harvester VM or other Machine Pools
    allocatedDevicesMap() {
      const map = {};

      // 1. Devices in use by existing Harvester VMs
      (this.harvesterVms || []).forEach((vm) => {
        const vmName = vm.metadata?.name || 'Unknown VM';
        const hostDevices = vm.spec?.template?.spec?.domain?.devices?.hostDevices || vm.hostDevices || [];

        hostDevices.forEach((dev) => {
          if (dev?.name) {
            map[dev.name] = {
              usedBy: vmName,
              type:   'Harvester VM',
            };
          }
        });
      });

      // 2. Devices selected in other machine pools within the same cluster creation form
      (this.machinePools || []).forEach((pool, idx) => {
        if (idx !== this.poolIndex && pool?.config?.gpuInfo) {
          try {
            const info = typeof pool.config.gpuInfo === 'string' ? JSON.parse(pool.config.gpuInfo) : pool.config.gpuInfo;

            if (info?.enabled && info?.pciDevice?.name) {
              const poolName = pool.pool?.name || `Machine Pool #${ idx + 1 }`;

              map[info.pciDevice.name] = {
                usedBy: poolName,
                type:   'Machine Pool',
              };
            }
          } catch (e) {}
        }
      });

      return map;
    },

    // Process only real Harvester PCI devices from API (NO dummy/demo fallback)
    allRealPciDevices() {
      if (!this.pciDevices || this.pciDevices.length === 0) {
        return [];
      }

      return this.pciDevices.map((dev) => {
        const address = dev.status?.address || dev.address || '';
        const nodeName = dev.status?.nodeName || dev.nodeName || 'unknown';
        const desc = dev.status?.description || dev.description || 'NVIDIA GPU';
        const name = dev.metadata?.name || dev.name || `pci-${ address.replace(/[:.]/g, '-') }`;
        const resourceName = dev.status?.resourceName || '';
        const detectedModel = this.detectGpuModel(`${ desc } ${ resourceName }`);

        // Match with Harvester PCIDeviceClaim
        const claim = (this.pciClaims || []).find((c) => {
          const matchName = c.metadata?.name === name;
          const matchAddr = c.spec?.address && c.spec?.address === address && c.spec?.nodeName === nodeName;

          return matchName || matchAddr;
        });

        // Device is passthrough enabled ONLY when Claim exists and status.passthroughEnabled is true
        const isEnabled = !!claim && (claim.status?.passthroughEnabled === true || claim.status?.passthroughEnabled === 'true');
        const allocationInfo = this.allocatedDevicesMap[name];
        const inUse = !!allocationInfo;
        const usedBy = allocationInfo ? allocationInfo.usedBy : null;

        return {
          name,
          address,
          nodeName,
          vendorId:           dev.status?.vendorId || '',
          deviceId:           dev.status?.deviceId || '',
          description:        desc,
          resourceName,
          model:              detectedModel,
          passthroughEnabled: isEnabled,
          inUse,
          usedBy,
        };
      });
    },

    // Strictly filtered device options:
    // 1) Enable Passthrough is TRUE
    // 2) inUse is FALSE (이미 할당된 장치 제외)
    // 3) Real PCI devices only (dummy 제거)
    deviceOptions() {
      const validDevices = this.allRealPciDevices.filter((dev) => {
        return dev.passthroughEnabled && !dev.inUse;
      });

      return validDevices.map((dev) => {
        // Label format matching Harvester UI screenshot: gpu01-0000e2000 (nvidia.com/GA100_A100_SXM4_40GB)
        const displayLabel = dev.resourceName ? `${ dev.name } (${ dev.resourceName })` : `${ dev.name } (${ dev.description })`;

        return {
          label:        displayLabel,
          value:        dev.name,
          name:         dev.name,
          address:      dev.address,
          nodeName:     dev.nodeName,
          vendorId:     dev.vendorId,
          deviceId:     dev.deviceId,
          description:  dev.description,
          resourceName: dev.resourceName,
          model:        dev.model,
        };
      });
    },

    selectedDeviceDetails() {
      if (this.manualDeviceInput) {
        if (!this.manualAddress || !this.manualNode) {
          return null;
        }

        return {
          name:               `pci-${ this.manualAddress.replace(/[:.]/g, '-') }`,
          address:            this.manualAddress,
          nodeName:           this.manualNode,
          vendorId:           '10de',
          deviceId:           '',
          description:        `NVIDIA ${ this.currentModel } PCIe`,
          resourceName:       `nvidia.com/${ this.currentModel }`,
          model:              this.currentModel,
          passthroughEnabled: true,
          inUse:              false,
          usedBy:             null,
        };
      }

      const match = this.allRealPciDevices.find((opt) => opt.name === this.selectedDeviceName);

      if (match) {
        return match;
      }

      if (this.value?.pciDevice) {
        return this.value.pciDevice;
      }

      return null;
    },

    quantityWarning() {
      if (this.value.enabled && this.quantity > 1) {
        return this.t(
          'harvesterManager.gpu.quantityWarning',
          { count: this.quantity },
          `The selected PCI device can only be assigned to one VM. Current pool quantity is ${ this.quantity }. For PCI passthrough, set quantity to 1 per GPU.`
        );
      }

      return null;
    },
  },

  watch: {
    credential: {
      handler(neu) {
        if (neu) {
          this.fetchPciDevices();
        }
      },
      immediate: true,
    },

    'value.enabled'(neu) {
      if (neu) {
        if (!this.selectedDeviceName && this.deviceOptions.length > 0) {
          this.onDeviceSelect(this.deviceOptions[0].value);
        } else if (this.selectedDeviceDetails) {
          this.applyNodeScheduling(this.selectedDeviceDetails.nodeName);
          this.applyNodeLabels(this.currentModel);
        }
      } else {
        this.$emit('update:nodeScheduling', null);
      }
    },
  },

  methods: {
    detectGpuModel(text = '') {
      const upper = (text || '').toUpperCase();

      if (upper.includes('H200')) {
        return 'H200';
      }
      if (upper.includes('A200')) {
        return 'A200';
      }
      if (upper.includes('H100')) {
        return 'H100';
      }
      if (upper.includes('A100')) {
        return 'A100';
      }
      if (upper.includes('L40S')) {
        return 'L40S';
      }
      if (upper.includes('L4')) {
        return 'L4';
      }
      if (upper.includes('A30')) {
        return 'A30';
      }
      if (upper.includes('V100')) {
        return 'V100';
      }

      return this.currentModel || 'A100';
    },

    async requestApiWithFallback(url, type) {
      try {
        const res = await this.$store.dispatch('cluster/request', { url: `${ url }/${ type }` });

        return res?.data || [];
      } catch (e) {
        // Try with plural 's' if singular failed
        try {
          const res = await this.$store.dispatch('cluster/request', { url: `${ url }/${ type }s` });

          return res?.data || [];
        } catch (err) {
          return [];
        }
      }
    },

    async fetchPciDevices() {
      const clusterId = get(this.credential, 'decodedData.clusterId');

      if (!clusterId) {
        return;
      }

      this.loadingDevices = true;
      try {
        const url = `/k8s/clusters/${ clusterId }/v1`;
        const [devices, claims, vms] = await Promise.all([
          this.requestApiWithFallback(url, HCI.PCI_DEVICE),
          this.requestApiWithFallback(url, HCI.PCI_CLAIM),
          this.requestApiWithFallback(url, HCI.VM),
        ]);

        if (Array.isArray(devices)) {
          // Strictly filter for NVIDIA PCI devices (vendorId 10de or description/resourceName containing nvidia)
          this.pciDevices = devices.filter((dev) => {
            const vendor = (dev.status?.vendorId || '').toLowerCase();
            const desc = (dev.status?.description || '').toLowerCase();
            const resource = (dev.status?.resourceName || '').toLowerCase();

            return vendor === '10de' || desc.includes('nvidia') || resource.includes('nvidia');
          });
        }

        if (Array.isArray(claims)) {
          this.pciClaims = claims;
        }

        if (Array.isArray(vms)) {
          this.harvesterVms = vms;
        }
      } catch (e) {
        this.pciDevices = [];
        this.pciClaims = [];
        this.harvesterVms = [];
      } finally {
        this.loadingDevices = false;

        // Auto-select first valid device if none selected
        if (this.value.enabled && !this.selectedDeviceName && this.deviceOptions.length > 0) {
          this.onDeviceSelect(this.deviceOptions[0].value);
        }
      }
    },

    onToggleEnable(val) {
      const updated = clone(this.value);

      updated.enabled = val;
      if (val) {
        updated.pciPassthrough = true;
        updated.vendor = 'nvidia';
        if (!updated.model) {
          updated.model = 'A100';
        }
        if (this.deviceOptions.length > 0) {
          const first = this.deviceOptions[0];

          this.selectedDeviceName = first.value;
          if (first.model) {
            updated.model = first.model;
          }
          updated.pciDevice = {
            name:         first.value,
            address:      first.address,
            nodeName:     first.nodeName,
            vendorId:     first.vendorId,
            deviceId:     first.deviceId,
            description:  first.description,
            resourceName: first.resourceName,
          };
          this.applyNodeScheduling(first.nodeName);
        } else {
          this.selectedDeviceName = '';
          updated.pciDevice = null;
        }
        updated.nodeLabels = getGpuNodeLabels(updated.model);
        this.applyNodeLabels(updated.model);
      } else {
        updated.pciPassthrough = false;
        this.$emit('update:nodeScheduling', null);
      }

      this.$emit('update:value', updated);
    },

    onModelChange(model) {
      const updated = clone(this.value);

      updated.model = model;
      updated.nodeLabels = getGpuNodeLabels(model);
      this.applyNodeLabels(model);
      this.$emit('update:value', updated);
    },

    onDeviceSelect(devName) {
      this.selectedDeviceName = devName;
      const dev = this.allRealPciDevices.find((d) => d.name === devName);

      if (dev) {
        const updated = clone(this.value);

        if (dev.model && dev.model !== updated.model) {
          updated.model = dev.model;
        }

        updated.pciDevice = {
          name:         dev.name,
          address:      dev.address,
          nodeName:     dev.nodeName,
          vendorId:     dev.vendorId,
          deviceId:     dev.deviceId,
          description:  dev.description,
          resourceName: dev.resourceName,
        };
        updated.nodeLabels = getGpuNodeLabels(updated.model);

        this.applyNodeScheduling(dev.nodeName);
        this.applyNodeLabels(updated.model);
        this.$emit('update:value', updated);
      }
    },

    onManualChange() {
      const updated = clone(this.value);

      updated.pciDevice = {
        name:         `pci-${ this.manualAddress.replace(/[:.]/g, '-') }`,
        address:      this.manualAddress,
        nodeName:     this.manualNode,
        vendorId:     '10de',
        deviceId:     '',
        description:  `NVIDIA ${ this.currentModel } PCIe`,
        resourceName: `nvidia.com/${ this.currentModel }`,
      };
      updated.nodeLabels = getGpuNodeLabels(this.currentModel);

      this.applyNodeScheduling(this.manualNode);
      this.applyNodeLabels(this.currentModel);
      this.$emit('update:value', updated);
    },

    applyNodeScheduling(nodeName) {
      if (!nodeName) {
        return;
      }
      this.$emit('update:nodeScheduling', nodeName);
    },

    applyNodeLabels(model) {
      const labels = getGpuNodeLabels(model || this.currentModel);

      this.$emit('update:labels', labels);
    },

    validate() {
      const errors = [];

      if (!this.value.enabled) {
        return errors;
      }

      if (!this.selectedDeviceDetails?.address) {
        errors.push(this.t('harvesterManager.gpu.errors.deviceRequired', null, 'A PCI device must be selected for GPU passthrough.'));
      }

      if (this.selectedDeviceDetails?.vendorId && this.selectedDeviceDetails.vendorId !== '10de') {
        errors.push(this.t('harvesterManager.gpu.errors.notNvidia', null, 'Selected PCI device is not an NVIDIA GPU.'));
      }

      if (this.selectedDeviceDetails && this.selectedDeviceDetails.passthroughEnabled === false) {
        errors.push(this.t('harvesterManager.gpu.errors.passthroughNotEnabled', null, 'The selected PCI device does not have PCI Passthrough enabled in Infinitystack. Please enable passthrough in Infinitystack UI first.'));
      }

      if (this.selectedDeviceDetails && this.selectedDeviceDetails.inUse) {
        errors.push(this.t('harvesterManager.gpu.errors.alreadyInUse', { vm: this.selectedDeviceDetails.usedBy }, `The selected PCI device is already in use by ${ this.selectedDeviceDetails.usedBy }. Please select an unallocated device.`));
      }

      if (this.quantity > 1) {
        errors.push(this.t('harvesterManager.gpu.errors.singleVmOnly', { count: this.quantity }, `The selected PCI device can only be assigned to one VM. Quantity is currently ${ this.quantity }.`));
      }

      return errors;
    },
  },
};
</script>

<template>
  <div class="harvester-gpu-config">
    <div class="row">
      <div class="col span-12">
        <h3 class="mb-10">
          {{ t('harvesterManager.gpu.sectionTitle', null, 'GPU Configuration (PCI Passthrough)') }}
        </h3>
        <p class="text-muted mb-15">
          {{ t('harvesterManager.gpu.sectionHelp', null, 'Configure physical NVIDIA GPU (A100, H100, A200, H200, etc.) PCI Passthrough. Only unallocated devices with Enable Passthrough active are listed.') }}
        </p>
      </div>
    </div>

    <!-- Enable GPU Toggle -->
    <div class="row mb-20">
      <div class="col span-6">
        <Checkbox
          :value="value.enabled"
          :mode="mode"
          :disabled="disabled"
          :label="t('harvesterManager.gpu.enableGpu', null, 'Enable GPU (PCI Passthrough)')"
          data-testid="harvester-enable-gpu"
          @update:value="onToggleEnable"
        />
      </div>
      <div
        v-if="value.enabled"
        class="col span-6"
      >
        <Checkbox
          :value="value.pciPassthrough"
          :mode="mode"
          :disabled="true"
          :label="t('harvesterManager.gpu.enablePassthrough', null, 'PCI Passthrough (Enabled)')"
        />
      </div>
    </div>

    <!-- Quantity Warning Banner (PRD Case 5) -->
    <div
      v-if="value.enabled && quantityWarning"
      class="row mb-15"
    >
      <div class="col span-12">
        <Banner
          color="warning"
          :label="quantityWarning"
        />
      </div>
    </div>

    <!-- Detailed Configuration when Enabled -->
    <div
      v-if="value.enabled"
      class="gpu-details-box"
    >
      <!-- Warning if No Available (Unallocated + Passthrough Ready) Device is found -->
      <div
        v-if="!loadingDevices && deviceOptions.length === 0 && !manualDeviceInput"
        class="row mb-15"
      >
        <div class="col span-12">
          <Banner
            color="warning"
            class="m-0"
          >
            <span>
              <strong>{{ t('harvesterManager.gpu.noAvailableDevicesTitle', null, 'No Available Passthrough-Enabled GPU:') }}</strong>
              {{ t('harvesterManager.gpu.noAvailableDevicesHelp', null, 'No available NVIDIA GPUs with PCI Passthrough enabled were found. In Infinitystack UI, navigate to Advanced > PCI Devices and click "Enable Passthrough" on an unallocated GPU.') }}
            </span>
          </Banner>
        </div>
      </div>

      <div class="row mb-20">
        <!-- GPU Type / Model -->
        <div class="col span-6">
          <LabeledSelect
            :value="currentModel"
            :options="gpuModels"
            :mode="mode"
            :disabled="disabled"
            :searchable="true"
            :taggable="true"
            label="GPU Model (e.g. A100, H100, A200, H200)"
            @update:value="onModelChange"
          />
        </div>

        <!-- Available PCI Devices Dropdown (Matches Infinitystack UI screenshot) -->
        <div class="col span-6">
          <Loading
            v-if="loadingDevices"
            :delayed="true"
            size="small"
          />
          <template v-else>
            <LabeledSelect
              v-if="!manualDeviceInput"
              :value="selectedDeviceName"
              :options="deviceOptions"
              :mode="mode"
              :disabled="disabled || deviceOptions.length === 0"
              label="Available PCI Devices"
              :placeholder="deviceOptions.length === 0 ? 'No available passthrough devices found' : 'Select an available PCI device'"
              @update:value="onDeviceSelect"
            />
            <div
              v-else
              class="row"
            >
              <div class="col span-6">
                <LabeledInput
                  v-model:value="manualAddress"
                  label="PCI Address"
                  placeholder="0000:e2:00.0"
                  :mode="mode"
                  :disabled="disabled"
                  @update:value="onManualChange"
                />
              </div>
              <div class="col span-6">
                <LabeledInput
                  v-model:value="manualNode"
                  label="Harvester Node"
                  placeholder="gpu01"
                  :mode="mode"
                  :disabled="disabled"
                  @update:value="onManualChange"
                />
              </div>
            </div>

            <div class="d-flex justify-content-between align-items-center mt-5">
              <a
                href="javascript:void(0)"
                class="text-small text-muted"
                @click="manualDeviceInput = !manualDeviceInput"
              >
                {{ manualDeviceInput ? 'Select from Infinitystack available devices' : 'Enter device address manually' }}
              </a>

              <a
                v-if="!manualDeviceInput"
                href="javascript:void(0)"
                class="text-small text-muted"
                @click="fetchPciDevices"
              >
                <i class="icon icon-refresh" /> Refresh devices
              </a>
            </div>
          </template>
        </div>
      </div>

      <!-- Node Affinity & Label Auto-binding Status -->
      <div
        v-if="selectedDeviceDetails"
        class="row mb-20"
      >
        <div class="col span-12">
          <div class="info-card">
            <div class="info-row d-flex align-items-center flex-wrap">
              <span class="info-label">Infinitystack Host Node:</span>
              <span class="badge bg-info mr-15">{{ selectedDeviceDetails.nodeName || 'N/A' }}</span>

              <span class="info-label">Passthrough Status:</span>
              <span class="badge bg-success mr-15">Passthrough Ready (Claimed)</span>

              <span class="info-label">Allocation Status:</span>
              <span class="badge bg-success mr-15">Available (Unallocated)</span>

              <span class="text-muted">
                (VM automatically scheduled to node <strong>{{ selectedDeviceDetails.nodeName }}</strong>)
              </span>
            </div>
            <div class="info-row mt-10">
              <span class="info-label">Kubernetes Node Labels:</span>
              <span class="badge bg-secondary mr-5">accelerator={{ currentNodeLabels['accelerator'] }}</span>
              <span class="badge bg-secondary mr-5">gpu.vendor=nvidia</span>
              <span class="badge bg-secondary mr-5">gpu.model={{ currentNodeLabels['gpu.model'] }}</span>
              <span class="badge bg-secondary">gpu.passthrough=true</span>
            </div>
          </div>
        </div>
      </div>

      <!-- GPU Configuration Preview / Summary (PRD Section 20) -->
      <div class="row mb-15">
        <div class="col span-12">
          <div class="gpu-summary-card">
            <div class="summary-header">
              <i class="icon icon-gear mr-5" />
              <strong>GPU Configuration Preview</strong>
            </div>
            <div class="summary-grid">
              <div class="grid-item">
                <span class="grid-label">GPU Model:</span>
                <span class="grid-val font-weight-bold">NVIDIA {{ currentModel }}</span>
              </div>
              <div class="grid-item">
                <span class="grid-label">PCI Passthrough:</span>
                <span class="grid-val text-success">Enabled</span>
              </div>
              <div class="grid-item">
                <span class="grid-label">PCI Device:</span>
                <span class="grid-val font-mono">{{ selectedDeviceDetails ? selectedDeviceDetails.name : 'Not selected' }}</span>
              </div>
              <div class="grid-item">
                <span class="grid-label">PCI Address:</span>
                <span class="grid-val font-mono">{{ selectedDeviceDetails ? selectedDeviceDetails.address : 'Not selected' }}</span>
              </div>
              <div class="grid-item">
                <span class="grid-label">Infinitystack Host Node:</span>
                <span class="grid-val font-mono">{{ selectedDeviceDetails ? selectedDeviceDetails.nodeName : 'Not selected' }}</span>
              </div>
              <div class="grid-item">
                <span class="grid-label">Allocation Status:</span>
                <span class="grid-val text-success">Available (Unallocated)</span>
              </div>
              <div class="grid-item">
                <span class="grid-label">NVIDIA vGPU:</span>
                <span class="grid-val text-muted">Disabled (Not used)</span>
              </div>
              <div class="grid-item">
                <span class="grid-label">MIG Management:</span>
                <span class="grid-val text-info">Managed inside GPU Worker VM</span>
              </div>
            </div>
            <div class="summary-footer mt-15">
              <Banner
                color="info"
                class="m-0"
              >
                <span>
                  <strong>Notice:</strong> NVIDIA vGPU licensing is not used. The physical GPU ({{ currentModel }}) is passed directly to the VM through PCI passthrough. MIG configuration and slicing are managed inside the VM via nvidia-smi / NVIDIA Device Plugin.
                </span>
              </Banner>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.harvester-gpu-config {
  margin-top: 15px;
  margin-bottom: 20px;
}

.gpu-details-box {
  padding: 16px;
  background: var(--body-bg);
  border: 1px solid var(--border);
  border-radius: var(--border-radius);
}

.info-card {
  padding: 12px 16px;
  background: var(--nav-active);
  border-radius: 4px;

  .info-label {
    font-weight: 600;
    margin-right: 8px;
  }
}

.gpu-summary-card {
  border: 1px solid var(--border);
  background: var(--tabview-bg);
  border-radius: 6px;
  padding: 16px;

  .summary-header {
    font-size: 14px;
    margin-bottom: 12px;
    display: flex;
    align-items: center;
  }

  .summary-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 12px;

    .grid-item {
      display: flex;
      flex-direction: column;

      .grid-label {
        font-size: 12px;
        color: var(--text-muted);
        margin-bottom: 2px;
      }

      .grid-val {
        font-size: 13px;
        font-weight: 500;
      }
    }
  }
}

.font-mono {
  font-family: monospace;
}
</style>
