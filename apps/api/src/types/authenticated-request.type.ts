/** The slice of an Express request that the key guards read and fill. */
export interface AuthenticatedRequest {
  headers: Record<string, string | string[] | undefined>;
  projectId?: string;
}
