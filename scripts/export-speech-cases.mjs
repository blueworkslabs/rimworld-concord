import {bankVersion,preparedSpeechCases} from '../dist/trials/speech-cases.js';
process.stdout.write(JSON.stringify({version:bankVersion,authored:true,cases:preparedSpeechCases()}));
