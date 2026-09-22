// Trusted current build, not caller-supplied case names or model-authored content.
import {bankVersion,preparedPerspectiveCases} from '../dist/trials/perspective-cases.js';
process.stdout.write(JSON.stringify({version:bankVersion,authored:true,cases:preparedPerspectiveCases()}));
