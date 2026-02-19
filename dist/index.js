import { CreateFanPlatform } from './platform.js';
import { PLATFORM_NAME } from './settings.js';
export default (api) => {
    api.registerPlatform(PLATFORM_NAME, CreateFanPlatform);
};
//# sourceMappingURL=index.js.map