import { existsSync, readFileSync } from "fs";
import { isAbsolute, resolve } from "path";
import { parse } from "dotenv";

const serverRoot = resolve(__dirname, "../../..");
const shellEnvironmentKeys = new Set(Object.keys(process.env));

const resolveEnvPath = (filePath: string): string => {
    return isAbsolute(filePath) ? filePath : resolve(serverRoot, filePath);
};

const applyEnvFile = (filePath: string): void => {
    if (!existsSync(filePath)) {
        return;
    }

    const parsed = parse(readFileSync(filePath, "utf8"));
    Object.entries(parsed).forEach(([key, value]) => {
        if (shellEnvironmentKeys.has(key)) {
            return;
        }
        process.env[key] = value;
    });
};

export const loadServerEnvironment = (): void => {
    const explicitEnvFile = process.env.SERVER_ENV_FILE?.trim();
    if (explicitEnvFile) {
        applyEnvFile(resolveEnvPath(explicitEnvFile));
        return;
    }

    const nodeEnv = process.env.NODE_ENV?.trim().toLowerCase();
    applyEnvFile(resolve(serverRoot, ".env"));

    if (nodeEnv === "production") {
        applyEnvFile(resolve(serverRoot, ".env.production"));
        return;
    }

    applyEnvFile(resolve(serverRoot, ".env.local"));
};

loadServerEnvironment();