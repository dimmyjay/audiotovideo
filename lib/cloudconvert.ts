// lib/cloudconvert.ts
import CloudConvert from 'cloudconvert';

const cloudConvert = new CloudConvert(process.env.CLOUDCONVERT_API_KEY!);

export default cloudConvert;
