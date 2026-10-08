import type {
  ClassSummary,
  ProfessorProfile,
  ProfessorProfileUpdate,
} from "@educai/contracts";

import type { DatabaseClient } from "../database.js";

type QueryResult<Row> = { rows: Row[] };

type ProfileRow = {
  id: string;
  display_name: string;
  email: string;
  profile_image_url: string | null;
  notification_preference: ProfessorProfile["notificationPreference"];
  created_at: Date;
};

type ClassRow = {
  id: string;
  name: string;
  description: string | null;
  school_year: string;
  origin: ClassSummary["source"];
};

export class ProfileRepository {
  constructor(private readonly database: DatabaseClient) {}

  async getProfile(professorId: string): Promise<{
    profile: ProfessorProfile;
    classes: ClassSummary[];
  } | null> {
    const profileResult = (await this.database.query(
      `SELECT id, display_name, email::text, profile_image_url,
              notification_preference, created_at
       FROM professor WHERE id = $1`,
      [professorId],
    )) as QueryResult<ProfileRow>;
    const profile = profileResult.rows[0];
    if (!profile) return null;

    const classesResult = (await this.database.query(
      `SELECT id, name, description, school_year, origin
       FROM class_group WHERE professor_id = $1 ORDER BY name, id`,
      [professorId],
    )) as QueryResult<ClassRow>;

    return {
      profile: {
        id: profile.id,
        displayName: profile.display_name,
        email: profile.email,
        profileImageUrl: profile.profile_image_url,
        notificationPreference: profile.notification_preference,
        createdAt: profile.created_at.toISOString(),
      },
      classes: classesResult.rows.map((item) => ({
        id: item.id,
        name: item.name,
        description: item.description,
        schoolYear: item.school_year,
        source: item.origin,
      })),
    };
  }

  async updateProfile(
    professorId: string,
    input: ProfessorProfileUpdate,
  ): Promise<{
    profile: ProfessorProfile;
    classes: ClassSummary[];
  } | null> {
    await this.database.query(
      `UPDATE professor
       SET display_name = COALESCE($2, display_name),
           notification_preference = COALESCE($3, notification_preference)
       WHERE id = $1`,
      [
        professorId,
        input.displayName ?? null,
        input.notificationPreference ?? null,
      ],
    );
    return this.getProfile(professorId);
  }
}
