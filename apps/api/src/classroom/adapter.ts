export type ClassroomCourse = {
  googleClassroomId: string;
  name: string;
  description: string | null;
  schoolYear: string;
};

export interface ClassroomAdapter {
  readonly isFixture: boolean;
  listCourses(): Promise<ClassroomCourse[]>;
}

export class FixtureClassroomAdapter implements ClassroomAdapter {
  readonly isFixture = true;

  constructor(private readonly courses: ClassroomCourse[] = []) {}

  async listCourses(): Promise<ClassroomCourse[]> {
    return this.courses;
  }
}
