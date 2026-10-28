import type { Logger } from 'pino';
import { AxiosError, isAxiosError } from 'axios';

import type { IPermitConfig } from '#src/config';
import {
  UserInvitesApi as AutogenUserInvitesApi,
  type ElementsUserInviteApprove as GeneratedApprove,
  type ElementsUserInviteCreate as GeneratedCreate,
  type ElementsUserInviteRead as GeneratedRead,
  type ElementsUserInviteUpdate as GeneratedUpdate,
  type PaginatedResultElementsUserInviteRead as GeneratedPage,
} from '#src/openapi/index';
import { BASE_PATH } from '#src/openapi/base';
import { BasePermitApi, PermitApiError, type IPagination } from '#src/api/base';
import { ApiContextLevel, ApiKeyLevel } from '#src/api/context';
// oxlint-disable-next-line no-unused-vars -- Public TSDoc resolves the named context failure.
import type { PermitContextError } from '#src/api/context';
import type { UserRead } from '#src/api/users';
import { diagnosticAxiosError, diagnosticMetadata } from '#src/utils/diagnostics';

export { UserInviteStatus } from '#src/openapi/index';

type NullableInviteKeys = 'key' | 'first_name' | 'last_name' | 'resource_instance_id';

/** Complete invite creation body; nullable fields remain required by the facts API. */
export interface ElementsUserInviteCreate extends Omit<GeneratedCreate, NullableInviteKeys> {
  /** Suggested user key; approval supplies the final key. */
  key: string | null;
  /** First name, or null when absent. */
  first_name: string | null;
  /** Last name, or null when absent. */
  last_name: string | null;
  /** Internal instance ID, or null for a tenant role invite. */
  resource_instance_id: string | null;
}

/** Full PATCH body; the facts endpoint requires every editable field. */
export interface ElementsUserInviteUpdate extends Omit<GeneratedUpdate, NullableInviteKeys> {
  /** Suggested user key; approval supplies the final key. */
  key: string | null;
  /** First name, or null when absent. */
  first_name: string | null;
  /** Last name, or null when absent. */
  last_name: string | null;
  /** Internal instance ID, or null for a tenant role invite. */
  resource_instance_id: string | null;
}

/** Stored invite, including its required context, timestamps and nullable editable fields. */
export interface ElementsUserInviteRead extends Omit<GeneratedRead, NullableInviteKeys> {
  /** Suggested or approved user key. */
  key: string | null;
  /** First name, or null when absent. */
  first_name: string | null;
  /** Last name, or null when absent. */
  last_name: string | null;
  /** Internal instance ID, or null for a tenant role invite. */
  resource_instance_id: string | null;
}

/** Approval body: the matching email, final user key and required nullable attributes. */
export interface ElementsUserInviteApprove extends Omit<GeneratedApprove, 'attributes'> {
  /** User attributes, or null; this field must be supplied. */
  attributes: object | null;
}

/** Full invite page; page_count, when present, counts rows on the current page. */
export interface PaginatedResultElementsUserInviteRead extends Omit<GeneratedPage, 'data'> {
  /** The returned invite rows, including legal null values. */
  data: ElementsUserInviteRead[];
}

/** Approval's user result; an explicit attribute shape is a caller assertion, not validation. */
export interface UserInviteApprovalRead<Attributes extends object = object> extends Omit<
  UserRead<Attributes>,
  'first_name' | 'last_name' | 'attributes'
> {
  /** First name, if supplied, including null. */
  first_name?: string | null;
  /** Last name, if supplied, including null. */
  last_name?: string | null;
  /** Returned attributes retain their actual null or caller-declared shape. */
  attributes?: Attributes | null;
}

/** Scoped role/tenant filters and text search across invite email, key or name. */
export interface IListUserInvites extends IPagination {
  /** Role key or ID to filter by. */
  role?: string;
  /** Tenant key or ID to filter by. */
  tenant?: string;
  /** Text to search for in the invite email, key or name. */
  search?: string;
}

/** Manages facts invites directly through the control plane; it does not send invitation mail. */
export interface IUserInvitesApi {
  /**
   * Lists invites in the selected environment.
   * @param params - Optional filters; page defaults to 1 and perPage to 100.
   * @returns The complete page without replacing counts, nulls or additive fields.
   * @throws {@link PermitApiError} If the API rejects the request.
   * @throws {@link PermitContextError} If the selected context or API key scope is insufficient.
   */
  list(params?: IListUserInvites): Promise<PaginatedResultElementsUserInviteRead>;

  /**
   * Stores an invite record. Setting its status does not approve a user or assign a role.
   * @param invite - All editable fields; role and tenant references are internal UUIDs.
   * @returns The stored invite, including its internal ID.
   * @throws {@link PermitApiError} If the API rejects the body or denies write access.
   * @throws {@link PermitContextError} If the selected context or API key scope is insufficient.
   */
  create(invite: ElementsUserInviteCreate): Promise<ElementsUserInviteRead>;

  /**
   * Gets an invite by its internal ID.
   * @param userInviteId - The internal invite ID; this route does not look up user keys.
   * @returns The stored invite.
   * @throws {@link PermitApiError} If the invite is absent or the API rejects the request.
   * @throws {@link PermitContextError} If the selected context or API key scope is insufficient.
   */
  get(userInviteId: string): Promise<ElementsUserInviteRead>;

  /**
   * Updates an invite using the complete editable body, even though the route uses PATCH.
   * @param userInviteId - The internal invite ID.
   * @param invite - All editable fields, including required nullable fields.
   * @returns The updated invite; changing status alone does not execute approval.
   * @throws {@link PermitApiError} If the API rejects the body or denies write access.
   * @throws {@link PermitContextError} If the selected context or API key scope is insufficient.
   */
  update(userInviteId: string, invite: ElementsUserInviteUpdate): Promise<ElementsUserInviteRead>;

  /**
   * Deletes an invite record; it does not revoke facts created by an earlier approval.
   * @param userInviteId - The internal invite ID.
   * @returns A promise that resolves to undefined after successful deletion.
   * @throws {@link PermitApiError} If the invite is absent or write access is denied.
   * @throws {@link PermitContextError} If the selected context or API key scope is insufficient.
   */
  delete(userInviteId: string): Promise<void>;

  /**
   * Approves an invite, creating or reusing its user and granting membership and the invite role.
   * Uses the control plane even when facts proxying is enabled; success is not PDP synchronization.
   * @param userInviteId - The internal invite ID.
   * @param approval - Matching email, final user key and required nullable attributes.
   * @returns The actual user; existing-user profile attributes are not guaranteed to be replaced.
   * HTTP 400 refusals omit remote text and body, which can contain another invite's email.
   * @throws {@link PermitApiError} If approval is refused or the API denies write access.
   * @throws {@link PermitContextError} If the selected context or API key scope is insufficient.
   */
  approve<Attributes extends object = object>(
    userInviteId: string,
    approval: ElementsUserInviteApprove,
  ): Promise<UserInviteApprovalRead<Attributes>>;
}

/** Direct API-key client for the six facts user-invite operations. */
export class UserInvitesApi extends BasePermitApi implements IUserInvitesApi {
  private readonly invites: AutogenUserInvitesApi;

  /**
   * Creates the invite client.
   * @param config - The SDK configuration and selected API context.
   * @param logger - The SDK logger.
   */
  constructor(config: IPermitConfig, logger: Logger) {
    super(config, logger);
    this.invites = new AutogenUserInvitesApi(
      this.openapiClientConfig,
      BASE_PATH,
      this.config.axiosInstance,
    );
  }

  /** {@inheritDoc IUserInvitesApi.list} */
  public async list(params: IListUserInvites = {}): Promise<PaginatedResultElementsUserInviteRead> {
    const { role, tenant, search, page = 1, perPage = 100 } = params;
    await this.ensureAccessLevel(ApiKeyLevel.ENVIRONMENT_LEVEL_API_KEY);
    await this.ensureContext(ApiContextLevel.ENVIRONMENT);
    try {
      return (
        await this.invites.listUserInvites({
          ...this.config.apiContext.environmentContext,
          ...(role !== undefined && { role }),
          ...(tenant !== undefined && { tenant }),
          ...(search !== undefined && { search }),
          page,
          perPage,
        })
      ).data;
    } catch (err) {
      this.handleApiError(err);
    }
  }

  /** {@inheritDoc IUserInvitesApi.create} */
  public async create(invite: ElementsUserInviteCreate): Promise<ElementsUserInviteRead> {
    await this.ensureAccessLevel(ApiKeyLevel.ENVIRONMENT_LEVEL_API_KEY);
    await this.ensureContext(ApiContextLevel.ENVIRONMENT);
    try {
      return (
        await this.invites.createUserInvite({
          ...this.config.apiContext.environmentContext,
          // Captured declarations omit the pinned API's four required nullable fields.
          elementsUserInviteCreate: invite as GeneratedCreate,
        })
      ).data;
    } catch (err) {
      this.handleApiError(err);
    }
  }

  /** {@inheritDoc IUserInvitesApi.get} */
  public async get(userInviteId: string): Promise<ElementsUserInviteRead> {
    await this.ensureAccessLevel(ApiKeyLevel.ENVIRONMENT_LEVEL_API_KEY);
    await this.ensureContext(ApiContextLevel.ENVIRONMENT);
    try {
      return (
        await this.invites.getUserInvite({
          ...this.config.apiContext.environmentContext,
          userInviteId,
        })
      ).data;
    } catch (err) {
      this.handleApiError(err);
    }
  }

  /** {@inheritDoc IUserInvitesApi.update} */
  public async update(
    userInviteId: string,
    invite: ElementsUserInviteUpdate,
  ): Promise<ElementsUserInviteRead> {
    await this.ensureAccessLevel(ApiKeyLevel.ENVIRONMENT_LEVEL_API_KEY);
    await this.ensureContext(ApiContextLevel.ENVIRONMENT);
    try {
      return (
        await this.invites.updateUserInvite({
          ...this.config.apiContext.environmentContext,
          userInviteId,
          // Captured declarations omit the pinned API's four required nullable fields.
          elementsUserInviteUpdate: invite as GeneratedUpdate,
        })
      ).data;
    } catch (err) {
      this.handleApiError(err);
    }
  }

  /** {@inheritDoc IUserInvitesApi.delete} */
  public async delete(userInviteId: string): Promise<void> {
    await this.ensureAccessLevel(ApiKeyLevel.ENVIRONMENT_LEVEL_API_KEY);
    await this.ensureContext(ApiContextLevel.ENVIRONMENT);
    try {
      await this.invites.deleteUserInvite({
        ...this.config.apiContext.environmentContext,
        userInviteId,
      });
    } catch (err) {
      this.handleApiError(err);
    }
  }

  /** {@inheritDoc IUserInvitesApi.approve} */
  public async approve<Attributes extends object = object>(
    userInviteId: string,
    approval: ElementsUserInviteApprove,
  ): Promise<UserInviteApprovalRead<Attributes>> {
    await this.ensureAccessLevel(ApiKeyLevel.ENVIRONMENT_LEVEL_API_KEY);
    await this.ensureContext(ApiContextLevel.ENVIRONMENT);
    try {
      const response = await this.invites.approveUserInvite({
        ...this.config.apiContext.environmentContext,
        userInviteId,
        // The verified approval body requires attributes but permits null.
        elementsUserInviteApprove: approval as GeneratedApprove,
      });
      // Preserve real nullable values; an explicit Attributes argument is a caller assertion.
      return response.data as UserInviteApprovalRead<Attributes>;
    } catch (err) {
      if (isAxiosError(err) && diagnosticMetadata(err).status === 400) {
        const snapshot = diagnosticAxiosError(err, [this.config.token]);
        // A wrong-email refusal contains stored data absent from this request's private values.
        const refusal = new AxiosError(
          'User invite approval refused. Check the invite status, matching email and role target.',
          snapshot.code,
          snapshot.config,
        );
        refusal.status = 400;
        const failure = new PermitApiError(refusal.message, refusal);
        this.logger.error({ err: failure, operation: 'REST' }, 'Permit REST API request failed');
        throw failure;
      }
      this.handleApiError(err);
    }
  }
}
