<script>
export default {
  props: {
    cluster: {
      type:     Object,
      required: true,
    },
    small: {
      type:    Boolean,
      default: false,
    }
  },

  computed: {
    useForIcon() {
      return !!this.cluster?.badge?.iconText;
    },
    showBorders() {
      return this.cluster?.badge?.color === 'transparent';
    },
  }
};
</script>

<template>
  <div
    v-if="cluster"
    class="cluster-icon"
    :class="{'cluster-icon-small': small}"
  >
    <div
      v-if="useForIcon"
      class="cluster-badge-logo"
      :class="{ 'cluster-icon-border': showBorders}"
      :style="{ backgroundColor: cluster.badge.color, color: cluster.badge.textColor }"
    >
      {{ cluster.badge.iconText }}
    </div>
    <!-- eslint-disable -->
    <svg 
      v-else-if="cluster.isLocal && !cluster.isHarvester" 
      class="cluster-local-logo" 
      version="1.1" 
      id="Layer_1" 
      xmlns="http://www.w3.org/2000/svg" 
      xmlns:xlink="http://www.w3.org/1999/xlink" 
      x="0px" 
      y="0px" 
      viewBox="0 0 100 100" 
      style="enable-background:new 0 0 100 100;" 
      xml:space="preserve">
      <title>{{ t('nav.ariaLabel.clusterProvIcon', { cluster: 'local' }) }}</title>
      <g>
        <g>
          <path
            class="rancher-icon-fill"
            d="M64.57,78.33c1.33-3.56,2.08-7.28,2.16-11.1,.02-1.2-.13-1.3-1.31-1.1-.89,.15-1.77,.35-2.67,.41-3.84,.27-7.66,.12-11.45-.64-4.85-.97-9.48-2.49-13.54-5.44-1.59-1.16-2.99-2.52-4.28-4.41,.77,.53,1.25,.9,1.76,1.21,5.22,3.24,10.82,5.58,16.83,6.9,3.96,.87,7.92,1.57,12.03,1.13,1.2-.13,1.36-.72,1.51-1.62,.36-2.17,.77-2.63,2.91-2.99,2.02-.34,4.07-.56,6.1-.89,3.41-.54,5.97-2.21,7.24-5.57,1-2.65,1.26-5.4,1.16-8.2-.07-2.01-.88-3.65-2.48-4.83-.78-.57-1.66-1.03-2.55-1.42-3.5-1.54-7.01-3.03-10.52-4.54-.16-.07-.28-.2-.51-.37,1.3-.11,2.46-.17,3.61-.3,2.87-.32,5.77-.64,8.34-2.07,1.13-.63,2.16-1.57,2.96-2.58,.75-.95,.18-1.95-1.04-2.06-.97-.09-1.97-.1-2.93,.03-3.62,.5-7.22,1.05-10.9,.63-.89-.1-1.3-.36-1.6-1.2-1.68-4.79-3.43-9.55-5.15-14.33-.71-1.96-2.07-3.16-4.17-3.22-1.28-.03-2.63,.03-3.83,.42-3.14,1.02-6.22,2.26-9.33,3.37-1.86,.67-3.8,1.14-5.61,1.91-1.82,.77-3.01,2.19-3.26,4.26-.18,1.45-.38,2.89-.58,4.45,5.32-.54,10.43-.03,15.48,1.25,4.85,1.22,13.57,4.19,14.65,5.09-.74-.16-1.34-.27-1.92-.42-7.12-1.8-14.16-3.96-21.54-4.52-4.91-.38-9.76-.11-14.45,1.46-2.73,.91-5.26,2.21-7.16,4.48-2.5,2.98-1.85,6.28,1.6,8.1,1.82,.96,3.78,1.38,5.82,1.48,2.78,.14,5.55,.12,8.04-.4-.59-1.68-1.36-3.28-1.7-4.97-.47-2.33,.99-4.07,3.28-4.31,2.7-.28,6.56,2.9,6.81,5.62,.01,.15-.03,.31-.07,.63-1.46-1.95-3.15-3.29-5.37-3.87-1.54-.4-2.57,.39-2.6,1.99-.03,2.39,1.08,4.14,3.08,5.37,.22,.14,.44,.28,.76,.48q-1.79,.38-2.64,1.91c-1.41,2.56-2.82,5.11-4.19,7.6-.78,0-1.73-.29-2.15,.05-1.19,.99-1.71,.13-2.39-.55-.3-.31-.6-.63-.92-.92-2.51-2.25-5.41-2.99-8.72-2.29,1.26,4.34,4.03,6.83,8.43,7.4-.05-.03,.09,.71,.21,1.15,8.48,30.76,33.99,34.22,33.99,34.22,1.65-4.05,3.34-7.94,4.83-11.91"
          />
        </g>
      </g>
    </svg>
    <!-- eslint-enable -->
    <img
      v-else-if="cluster.providerNavLogo"
      class="cluster-os-logo"
      :src="cluster.providerNavLogo"
      :alt="t('nav.ariaLabel.clusterProvIcon', { cluster: cluster.nameDisplay })"
    >
  </div>
</template>

<style lang="scss" scoped>
  .rancher-icon-fill {
    fill: var(--primary);
  }
  .cluster-icon {
    align-items: center;
    display: flex;
    height: 32px;
    justify-content: center;
    width: 42px;

    &-border {
      border: 1px solid var(--border);
      border-radius: 5px;
      color: var(--body-text) !important; // !important is needed to override the color set by the badge when there's a transparent background.
    }
  }

  .cluster-icon-small {
    height: 25px;
    width: 25px;

    .cluster-os-logo {
      width: 25px;
      height: 25px;
    }

    .cluster-badge-logo {
      width: 25px;
      height: 25px;
    }
  }

  .cluster-os-logo {
    width: 32px;
    height: 32px;
  }
  .cluster-local-logo {
    display: flex;
    width: 25px;
  }
  .cluster-badge-logo {
    min-width: 42px;
    height: 32px;
    padding: 0px 5px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 5px;
    font-weight: bold;
  }
</style>
