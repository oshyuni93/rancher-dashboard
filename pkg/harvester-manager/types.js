import { UI_PLUGINS_REPOS } from '@shell/config/uiplugins';

export const communityRepoRegexes = [
  /^https:\/\/github\.com\/.*\/harvester-ui-extension+/g,
  /^https:\/\/.*\.github\.io\/harvester-ui-extension+/g,
];

export const HARVESTER_CHART = {
  name:     'infinitystack',
  version:  '',
  repoType: 'cluster',
  repoName: 'harvester',
};

export const HARVESTER_COMMUNITY_REPO = {
  metadata:  { name: 'harvester' },
  gitRepo:   'https://github.com/oshyuni93/harvester-ui-extension',
  gitBranch: 'gh-pages',
};

export const HARVESTER_RANCHER_REPO = {
  metadata:  { name: 'rancher' },
  gitRepo:   UI_PLUGINS_REPOS.OFFICIAL.URL,
  gitBranch: UI_PLUGINS_REPOS.OFFICIAL.BRANCH,
};
