import Ajv2020 from 'ajv/dist/2020';
import addFormats from 'ajv-formats';
import schema from '../../src/spec/DATA_SCHEMA.json';

const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv);
/** 公式 spec/DATA_SCHEMA.json（JSON Schema 2020-12）による検証 */
export const validateOfficial = ajv.compile(schema);
