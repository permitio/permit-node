import { Permit } from './index';

describe('paths are processed correctly', () => {
  beforeAll(async () => {
    console.log('Start testing');
  });
  it('should return all the users', async () => {
    const permit = new Permit({
      token: 'PJUKkuwiJkKxbIoC4o4cguWxB_2gX6MyATYKc2OCM',
      pdpUrl: 'http://127.0.0.1:8000',
      project: 'default',
      environment: 'dev',
    });

    const users = await permit.api.getUsers();
    console.log(users);
  });
});
