import { fileURLToPath } from 'url';
import db from './db.js';

// rep_min / rep_max: per-exercise rep range for double progression. Assigned by
// movement category — heavy barbell compounds run low (more weight, fewer reps),
// isolation runs mid, small single-joint raises run high (the wide gap absorbs
// the large %-jumps a light dumbbell forces). Editable per exercise afterwards.
const exercises = [
  // Chest
  { name: 'Bench Press',                    muscle_group: 'chest',     equipment: 'barbell',    default_increment: 2.5, rep_min: 6,  rep_max: 8  },
  { name: 'Incline Bench Press',            muscle_group: 'chest',     equipment: 'barbell',    default_increment: 2.5, rep_min: 6,  rep_max: 8  },
  { name: 'Decline Bench Press',            muscle_group: 'chest',     equipment: 'barbell',    default_increment: 2.5, rep_min: 6,  rep_max: 8  },
  { name: 'Dumbbell Bench Press',           muscle_group: 'chest',     equipment: 'dumbbell',   default_increment: 1,   rep_min: 8,  rep_max: 10 },
  { name: 'Incline Dumbbell Press',         muscle_group: 'chest',     equipment: 'dumbbell',   default_increment: 1,   rep_min: 8,  rep_max: 10 },
  { name: 'Dumbbell Fly',                   muscle_group: 'chest',     equipment: 'dumbbell',   default_increment: 1,   rep_min: 8,  rep_max: 12 },
  { name: 'Incline Dumbbell Fly',           muscle_group: 'chest',     equipment: 'dumbbell',   default_increment: 1,   rep_min: 8,  rep_max: 12 },
  { name: 'Cable Fly',                      muscle_group: 'chest',     equipment: 'cable',      default_increment: 2.5, rep_min: 10, rep_max: 15 },
  { name: 'Pec Deck',                       muscle_group: 'chest',     equipment: 'machine',    default_increment: 5,   rep_min: 10, rep_max: 15 },
  { name: 'Push-up',                        muscle_group: 'chest',     equipment: 'bodyweight', default_increment: 0,   rep_min: 12, rep_max: 20 },
  { name: 'Dips (Chest)',                   muscle_group: 'chest',     equipment: 'bodyweight', default_increment: 0,   rep_min: 8,  rep_max: 15 },
  // Back
  { name: 'Deadlift',                       muscle_group: 'back',      equipment: 'barbell',    default_increment: 5,   rep_min: 4,  rep_max: 6  },
  { name: 'Barbell Row',                    muscle_group: 'back',      equipment: 'barbell',    default_increment: 2.5, rep_min: 8,  rep_max: 10 },
  { name: 'T-bar Row',                      muscle_group: 'back',      equipment: 'barbell',    default_increment: 2.5, rep_min: 8,  rep_max: 10 },
  { name: 'Rack Pull',                      muscle_group: 'back',      equipment: 'barbell',    default_increment: 5,   rep_min: 4,  rep_max: 6  },
  { name: 'Meadows Row',                    muscle_group: 'back',      equipment: 'barbell',    default_increment: 2.5, rep_min: 8,  rep_max: 12 },
  { name: 'Dumbbell Row',                   muscle_group: 'back',      equipment: 'dumbbell',   default_increment: 1,   rep_min: 8,  rep_max: 12 },
  { name: 'Lat Pulldown',                   muscle_group: 'back',      equipment: 'cable',      default_increment: 2.5, rep_min: 8,  rep_max: 12 },
  { name: 'Seated Cable Row',               muscle_group: 'back',      equipment: 'cable',      default_increment: 2.5, rep_min: 8,  rep_max: 12 },
  { name: 'Single-arm Cable Row',           muscle_group: 'back',      equipment: 'cable',      default_increment: 2.5, rep_min: 10, rep_max: 15 },
  { name: 'Face Pull',                      muscle_group: 'back',      equipment: 'cable',      default_increment: 2.5, rep_min: 12, rep_max: 20 },
  { name: 'Pull-up',                        muscle_group: 'back',      equipment: 'bodyweight', default_increment: 0,   rep_min: 5,  rep_max: 12 },
  { name: 'Chin-up',                        muscle_group: 'back',      equipment: 'bodyweight', default_increment: 0,   rep_min: 5,  rep_max: 12 },
  // Shoulders
  { name: 'Overhead Press',                 muscle_group: 'shoulders', equipment: 'barbell',    default_increment: 2.5, rep_min: 5,  rep_max: 8  },
  { name: 'Upright Row',                    muscle_group: 'shoulders', equipment: 'barbell',    default_increment: 2.5, rep_min: 10, rep_max: 15 },
  { name: 'Dumbbell Shoulder Press',        muscle_group: 'shoulders', equipment: 'dumbbell',   default_increment: 1,   rep_min: 8,  rep_max: 10 },
  { name: 'Arnold Press',                   muscle_group: 'shoulders', equipment: 'dumbbell',   default_increment: 1,   rep_min: 8,  rep_max: 10 },
  { name: 'Lateral Raise',                  muscle_group: 'shoulders', equipment: 'dumbbell',   default_increment: 1,   rep_min: 12, rep_max: 20 },
  { name: 'Front Raise',                    muscle_group: 'shoulders', equipment: 'dumbbell',   default_increment: 1,   rep_min: 12, rep_max: 20 },
  { name: 'Rear Delt Fly',                  muscle_group: 'shoulders', equipment: 'dumbbell',   default_increment: 1,   rep_min: 12, rep_max: 20 },
  { name: 'Incline Dumbbell Reverse Fly',   muscle_group: 'shoulders', equipment: 'dumbbell',   default_increment: 1,   rep_min: 12, rep_max: 20 },
  { name: 'Incline Y Raises',               muscle_group: 'shoulders', equipment: 'dumbbell',   default_increment: 1,   rep_min: 12, rep_max: 20 },
  { name: 'Cable Lateral Raise',            muscle_group: 'shoulders', equipment: 'cable',      default_increment: 2.5, rep_min: 12, rep_max: 20 },
  // Biceps
  { name: 'Barbell Curl',                   muscle_group: 'biceps',    equipment: 'barbell',    default_increment: 2.5, rep_min: 8,  rep_max: 12 },
  { name: 'Preacher Curl',                  muscle_group: 'biceps',    equipment: 'barbell',    default_increment: 2.5, rep_min: 8,  rep_max: 12 },
  { name: 'Dumbbell Curl',                  muscle_group: 'biceps',    equipment: 'dumbbell',   default_increment: 1,   rep_min: 8,  rep_max: 12 },
  { name: 'Hammer Curl',                    muscle_group: 'biceps',    equipment: 'dumbbell',   default_increment: 1,   rep_min: 8,  rep_max: 12 },
  { name: 'Concentration Curl',             muscle_group: 'biceps',    equipment: 'dumbbell',   default_increment: 1,   rep_min: 10, rep_max: 15 },
  { name: 'Alternating Curl',               muscle_group: 'biceps',    equipment: 'dumbbell',   default_increment: 1,   rep_min: 8,  rep_max: 12 },
  { name: 'Spider Curl',                    muscle_group: 'biceps',    equipment: 'dumbbell',   default_increment: 1,   rep_min: 10, rep_max: 15 },
  { name: 'Cable Curl',                     muscle_group: 'biceps',    equipment: 'cable',      default_increment: 2.5, rep_min: 10, rep_max: 15 },
  // Triceps
  { name: 'Skull Crusher',                  muscle_group: 'triceps',   equipment: 'barbell',    default_increment: 2.5, rep_min: 8,  rep_max: 12 },
  { name: 'Skull Crushers',                 muscle_group: 'triceps',   equipment: 'dumbbell',   default_increment: 1,   rep_min: 8,  rep_max: 12 },
  { name: 'Close-grip Bench Press',         muscle_group: 'triceps',   equipment: 'barbell',    default_increment: 2.5, rep_min: 6,  rep_max: 10 },
  { name: 'Overhead Tricep Extension',      muscle_group: 'triceps',   equipment: 'dumbbell',   default_increment: 1,   rep_min: 10, rep_max: 15 },
  { name: 'Tricep Kickback',                muscle_group: 'triceps',   equipment: 'dumbbell',   default_increment: 1,   rep_min: 12, rep_max: 20 },
  { name: 'Dips (Triceps)',                 muscle_group: 'triceps',   equipment: 'bodyweight', default_increment: 0,   rep_min: 8,  rep_max: 15 },
  { name: 'Weighted Dips',                  muscle_group: 'triceps',   equipment: 'dumbbell',   default_increment: 2.5, rep_min: 6,  rep_max: 10 },
  { name: 'Tricep Pushdown',                muscle_group: 'triceps',   equipment: 'cable',      default_increment: 2.5, rep_min: 10, rep_max: 15 },
  { name: 'Cable Overhead Extension',       muscle_group: 'triceps',   equipment: 'cable',      default_increment: 2.5, rep_min: 10, rep_max: 15 },
  // Legs
  { name: 'Squat',                          muscle_group: 'legs',      equipment: 'barbell',    default_increment: 5,   rep_min: 5,  rep_max: 8  },
  { name: 'Front Squat',                    muscle_group: 'legs',      equipment: 'barbell',    default_increment: 2.5, rep_min: 5,  rep_max: 8  },
  { name: 'Romanian Deadlift',              muscle_group: 'legs',      equipment: 'barbell',    default_increment: 5,   rep_min: 6,  rep_max: 10 },
  { name: 'Sumo Deadlift',                  muscle_group: 'legs',      equipment: 'barbell',    default_increment: 5,   rep_min: 4,  rep_max: 6  },
  { name: 'Hip Thrust',                     muscle_group: 'legs',      equipment: 'barbell',    default_increment: 5,   rep_min: 8,  rep_max: 12 },
  { name: 'Stiff Legged Deadlift',          muscle_group: 'legs',      equipment: 'barbell',    default_increment: 5,   rep_min: 6,  rep_max: 10 },
  { name: 'Dumbbell Hip Thrust',            muscle_group: 'legs',      equipment: 'dumbbell',   default_increment: 1,   rep_min: 10, rep_max: 15 },
  { name: 'Dumbbell Stiff Legged Deadlift', muscle_group: 'legs',      equipment: 'dumbbell',   default_increment: 1,   rep_min: 8,  rep_max: 12 },
  { name: 'Bulgarian Split Squat',          muscle_group: 'legs',      equipment: 'dumbbell',   default_increment: 1,   rep_min: 8,  rep_max: 12 },
  { name: 'Lunges',                         muscle_group: 'legs',      equipment: 'dumbbell',   default_increment: 1,   rep_min: 8,  rep_max: 12 },
  { name: 'Step-up',                        muscle_group: 'legs',      equipment: 'dumbbell',   default_increment: 1,   rep_min: 8,  rep_max: 12 },
  { name: 'Leg Press',                      muscle_group: 'legs',      equipment: 'machine',    default_increment: 10,  rep_min: 8,  rep_max: 12 },
  { name: 'Hack Squat',                     muscle_group: 'legs',      equipment: 'machine',    default_increment: 5,   rep_min: 8,  rep_max: 12 },
  { name: 'Leg Curl',                       muscle_group: 'legs',      equipment: 'machine',    default_increment: 5,   rep_min: 10, rep_max: 15 },
  { name: 'Leg Extension',                  muscle_group: 'legs',      equipment: 'machine',    default_increment: 5,   rep_min: 10, rep_max: 15 },
  { name: 'Calf Raise',                     muscle_group: 'legs',      equipment: 'machine',    default_increment: 5,   rep_min: 12, rep_max: 20 },
  { name: 'Sissy Squat',                    muscle_group: 'legs',      equipment: 'bodyweight', default_increment: 0,   rep_min: 12, rep_max: 20 },
  // Core
  { name: 'Plank',                          muscle_group: 'core',      equipment: 'bodyweight', default_increment: 0,   rep_min: 12, rep_max: 20 },
  { name: 'Crunch',                         muscle_group: 'core',      equipment: 'bodyweight', default_increment: 0,   rep_min: 12, rep_max: 20 },
  { name: 'Hanging Leg Raise',              muscle_group: 'core',      equipment: 'bodyweight', default_increment: 0,   rep_min: 10, rep_max: 20 },
  { name: 'Cable Crunch',                   muscle_group: 'core',      equipment: 'cable',      default_increment: 2.5, rep_min: 12, rep_max: 20 },
  { name: 'Ab Wheel Rollout',               muscle_group: 'core',      equipment: 'bodyweight', default_increment: 0,   rep_min: 8,  rep_max: 15 },
  // Additional
  { name: 'Reverse Fly',                    muscle_group: 'back',      equipment: 'dumbbell',   default_increment: 1,   rep_min: 12, rep_max: 20 },
  { name: 'Incline Curl',                   muscle_group: 'biceps',    equipment: 'dumbbell',   default_increment: 1,   rep_min: 8,  rep_max: 12 },
];

const insert = db.prepare(`
  INSERT OR IGNORE INTO exercises (name, muscle_group, equipment, default_increment, rep_min, rep_max)
  VALUES (@name, @muscle_group, @equipment, @default_increment, @rep_min, @rep_max)
`);

export function seed() {
  db.transaction(() => { for (const ex of exercises) insert.run(ex); })();
  // Migrate existing dumbbell exercises that still have the old 2 kg default
  db.prepare(`UPDATE exercises SET default_increment = 1
    WHERE equipment = 'dumbbell' AND default_increment = 2 AND is_custom = 0`).run();
  // Sync researched rep ranges onto already-existing library rows — INSERT OR
  // IGNORE above leaves existing rows untouched, so rep_min/rep_max need a
  // separate pass to land on databases created before the columns existed.
  const syncRange = db.prepare(
    'UPDATE exercises SET rep_min = ?, rep_max = ? WHERE name = ? AND is_custom = 0'
  );
  db.transaction(() => {
    for (const ex of exercises) syncRange.run(ex.rep_min, ex.rep_max, ex.name);
  })();
  seedSamplePlan();
}

const SAMPLE_SLOTS = [
  // Monday (0)
  { day: 0, name: 'Incline Dumbbell Fly',      sets: 2, weight: 36,   reps: 8 },
  { day: 0, name: 'Dumbbell Row',               sets: 2, weight: null },
  { day: 0, name: 'Sissy Squat',                sets: 2, weight: null },
  { day: 0, name: 'Incline Dumbbell Press',     sets: 2, weight: null },
  { day: 0, name: 'Reverse Fly',                sets: 3, weight: null },
  // Tuesday (1)
  { day: 1, name: 'Dumbbell Curl',              sets: 3, weight: 23,   reps: 8 },
  { day: 1, name: 'Skull Crushers',             sets: 2, weight: 23,   reps: 8 },
  { day: 1, name: 'Overhead Tricep Extension',  sets: 2, weight: 18,   reps: 8 },
  { day: 1, name: 'Alternating Curl',           sets: 2, weight: 23,   reps: 8 },
  { day: 1, name: 'Incline Y Raises',           sets: 2, weight: 12.5, reps: 8 },
  // Thursday (3)
  { day: 3, name: 'Incline Dumbbell Fly',       sets: 2, weight: 36,   reps: 8 },
  { day: 3, name: 'Dumbbell Row',               sets: 2, weight: 36,   reps: 8 },
  { day: 3, name: 'Alternating Curl',           sets: 3, weight: 23,   reps: 8 },
  { day: 3, name: 'Stiff Legged Deadlift',      sets: 3, weight: 82,   reps: 8 },
  { day: 3, name: 'Sissy Squat',                sets: 3, weight: null },
  // Friday (4)
  { day: 4, name: 'Spider Curl',                sets: 3, weight: 18,   reps: 8 },
  { day: 4, name: 'Dips (Triceps)',             sets: 2, weight: null },
  { day: 4, name: 'Incline Curl',               sets: 3, weight: 23,   reps: 8 },
  { day: 4, name: 'Hip Thrust',                 sets: 2, weight: 28,   reps: 8 },
  { day: 4, name: 'Incline Y Raises',           sets: 3, weight: 12.5, reps: 8 },
];

function createSamplePlan(userId) {
  const { lastInsertRowid: planId } = db.prepare(
    "INSERT INTO workout_plans (name, is_active, week_count, user_id) VALUES ('Sample Workout', 0, 4, ?)"
  ).run(userId ?? null);

  const insDay    = db.prepare('INSERT INTO plan_days (plan_id, day_of_week) VALUES (?, ?)');
  const insSlot   = db.prepare('INSERT INTO schedule (plan_id, day_of_week, exercise_id, set_count, position) VALUES (?, ?, ?, ?, ?)');
  const insTarget = db.prepare("INSERT INTO set_targets (exercise_id, set_num, weight, reps, valid_from, plan_id) VALUES (?, ?, ?, ?, date('now'), ?)");
  const getEx     = name => db.prepare('SELECT id FROM exercises WHERE name = ?').get(name)?.id;

  db.transaction(() => {
    for (const dow of [0, 1, 3, 4]) insDay.run(planId, dow);
    const posByDay = {};
    for (const slot of SAMPLE_SLOTS) {
      const exId = getEx(slot.name);
      if (!exId) continue;
      const pos = posByDay[slot.day] ?? 0;
      posByDay[slot.day] = pos + 1;
      insSlot.run(planId, slot.day, exId, slot.sets, pos);
      if (slot.weight !== null) {
        for (let i = 1; i <= slot.sets; i++) insTarget.run(exId, i, slot.weight, slot.reps, planId);
      }
    }
  })();
}

function seedSamplePlan() {
  // Create a copy for each existing user who doesn't already have it
  const users = db.prepare('SELECT id FROM users').all();
  for (const { id: userId } of users) {
    if (!db.prepare("SELECT 1 FROM workout_plans WHERE name = 'Sample Workout' AND user_id = ?").get(userId))
      createSamplePlan(userId);
  }
  // Keep a null-user version so new registrants automatically claim it
  if (!db.prepare("SELECT 1 FROM workout_plans WHERE name = 'Sample Workout' AND user_id IS NULL").get())
    createSamplePlan(null);
}

// Run directly (npm run setup / node server/seed.js)
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  seed();
  console.log(`Seeded ${exercises.length} exercises`);
  process.exit(0);
}
