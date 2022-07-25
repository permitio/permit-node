export function buildPermitURL(url: string, project: string, environment: string): string {
  return `${url}/${project}/${environment}/`;
}
