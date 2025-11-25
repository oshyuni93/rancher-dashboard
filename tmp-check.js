const fs = require('fs');
const yaml = require('js-yaml');
const IntlMessageFormat = require('intl-messageformat').default;

const data = yaml.load(fs.readFileSync('pkg/ko-locale/l10n/ko-kr2.yaml', 'utf8'));
const str = data.catalog.install.steps.basics.description;

console.log('Type:', typeof str);
console.log(str);

try {
  new IntlMessageFormat(str, 'ko-kr');
  console.log('Parsed successfully');
} catch (err) {
  console.error('IntlMessageFormat error:', err.message);
}

