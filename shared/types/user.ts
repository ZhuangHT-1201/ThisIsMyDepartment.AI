export interface DepartmentUser {
    userId: string;
    displayName: string;
    externalId?: string;
    email?: string;
    organization?: string;
    department?: string;
    roles: string[];
}

export interface VerifiedIdentity {
    externalProvider: string;
    externalId: string;
    displayName: string;
    email?: string;
    organization?: string;
    department?: string;
    roles?: string[];
}