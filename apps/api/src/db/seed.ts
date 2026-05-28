import { studies } from "./schema";
import { db, pool } from "./client";

const [study] = await db
  .insert(studies)
  .values({
    slug: "aurora-cardiometabolic-study",
    displayName: "Aurora Cardiometabolic Study",
    shortDescription:
      "Synthetic study workspace for aggregate cardiometabolic outcomes review.",
    sensitivityLabel: "Synthetic regulated workspace"
  })
  .onConflictDoUpdate({
    target: studies.slug,
    set: {
      displayName: "Aurora Cardiometabolic Study",
      shortDescription:
        "Synthetic study workspace for aggregate cardiometabolic outcomes review.",
      sensitivityLabel: "Synthetic regulated workspace"
    }
  })
  .returning({
    id: studies.id,
    slug: studies.slug
  });

if (!study) {
  throw new Error("Failed to seed study workspace");
}

console.log(`Seeded study workspace: ${study.slug} (${study.id})`);

await pool.end();
