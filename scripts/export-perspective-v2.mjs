import {bankVersion,preparedPerspectiveCasesV2} from '../dist/trials/perspective-v2.js';
console.log(JSON.stringify({bankVersion,cases:preparedPerspectiveCasesV2()},null,2));
