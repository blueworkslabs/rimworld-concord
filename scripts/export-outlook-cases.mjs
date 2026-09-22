// Trusted current build, not caller-supplied case names or model-authored content.
import {bankVersion,preparedOutlookCases} from '../dist/trials/outlook-cases.js';
process.stdout.write(JSON.stringify({version:bankVersion,authored:true,cases:preparedOutlookCases()}));
