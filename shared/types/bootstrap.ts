import type { AgentDefinition } from "./agent";
import type { UserProfile } from "./profile";
import type { AppSession } from "./session";
import type { DepartmentUser } from "./user";

export interface BootstrapResponse {
    authenticated: boolean;
    user: DepartmentUser | null;
    profile: UserProfile | null;
    session: AppSession | null;
    agents: AgentDefinition[];
    room: {
        roomId: string;
        displayName: string;
    } | null;
    loginUrl?: string | null;
}