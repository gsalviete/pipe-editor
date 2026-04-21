export interface OAuthTokenResponse {
    accessToken: string;
    tokenType: string;
    scope: string;
}
export interface GitHubUser {
    id: number;
    login: string;
    name: string | null;
    email: string | null;
    avatarUrl: string;
}
export interface RawWorkflowFile {
    name: string;
    path: string;
    content: string;
}
export interface GitHubApiOptions {
    accessToken: string;
}
