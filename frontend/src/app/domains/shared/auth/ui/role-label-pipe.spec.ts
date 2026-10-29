import { ROLES } from '@app/shared/auth/models/auth';
import { RoleLabelPipe } from './role-label-pipe';

describe('RoleLabelPipe', () => {
  const pipe = new RoleLabelPipe();

  it('shows the USER role as Employee', () => {
    expect(pipe.transform('USER')).toBe('Employee');
  });

  it('shows the ADMIN role as Admin', () => {
    expect(pipe.transform('ADMIN')).toBe('Admin');
  });

  it('has a label for every role', () => {
    for (const role of ROLES) {
      expect(pipe.transform(role)).toBeTruthy();
    }
  });
});
