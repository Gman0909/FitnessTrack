import { fileURLToPath } from 'url';
import db from './db.js';

const exercises = [
  // Chest
  { name: 'Bench Press',                    muscle_group: 'chest',     equipment: 'barbell',    default_increment: 2.5 },
  { name: 'Incline Bench Press',            muscle_group: 'chest',     equipment: 'barbell',    default_increment: 2.5 },
  { name: 'Decline Bench Press',            muscle_group: 'chest',     equipment: 'barbell',    default_increment: 2.5 },
  { name: 'Dumbbell Bench Press',           muscle_group: 'chest',     equipment: 'dumbbell',   default_increment: 2   },
  { name: 'Incline Dumbbell Press',         muscle_group: 'chest',     equipment: 'dumbbell',   default_increment: 2   },
  { name: 'Dumbbell Fly',                   muscle_group: 'chest',     equipment: 'dumbbell',   default_increment: 2   },
  { name: 'Incline Dumbbell Fly',           muscle_group: 'chest',     equipment: 'dumbbell',   default_increment: 2   },
  { name: 'Cable Fly',                      muscle_group: 'chest',     equipment: 'cable',      default_increment: 2.5 },
  { name: 'Pec Deck',                       muscle_group: 'chest',     equipment: 'machine',    default_increment: 5   },
  { name: 'Push-up',                        muscle_group: 'chest',     equipment: 'bodyweight', default_increment: 0   },
  { name: 'Dip',                            muscle_group: 'chest',     equipment: 'bodyweight', default_increment: 0   },
  // Back
  { name: 'Deadlift',                       muscle_group: 'back',      equipment: 'barbell',    default_increment: 5   },
  { name: 'Barbell Row',                    muscle_group: 'back',      equipment: 'barbell',    default_increment: 2.5 },
  { name: 'T-bar Row',                      muscle_group: 'back',      equipment: 'barbell',    default_increment: 2.5 },
  { name: 'Rack Pull',                      muscle_group: 'back',      equipment: 'barbell',    default_increment: 5   },
  { name: 'Meadows Row',                    muscle_group: 'back',      equipment: 'barbell',    default_increment: 2.5 },
  { name: 'Dumbbell Row',                   muscle_group: 'back',      equipment: 'dumbbell',   default_increment: 2   },
  { name: 'Lat Pulldown',                   muscle_group: 'back',      equipment: 'cable',      default_increment: 2.5 },
  { name: 'Seated Cable Row',               muscle_group: 'back',      equipment: 'cable',      default_increment: 2.5 },
  { name: 'Single-arm Cable Row',           muscle_group: 'back',      equipment: 'cable',      default_increment: 2.5 },
  { name: 'Face Pull',                      muscle_group: 'back',      equipment: 'cable',      default_increment: 2.5 },
  { name: 'Pull-up',                        muscle_group: 'back',      equipment: 'bodyweight', default_increment: 0   },
  { name: 'Chin-up',                        muscle_group: 'back',      equipment: 'bodyweight', default_increment: 0   },
  // Shoulders
  { name: 'Overhead Press',                 muscle_group: 'shoulders', equipment: 'barbell',    default_increment: 2.5 },
  { name: 'Upright Row',                    muscle_group: 'shoulders', equipment: 'barbell',    default_increment: 2.5 },
  { name: 'Dumbbell Shoulder Press',        muscle_group: 'shoulders', equipment: 'dumbbell',   default_increment: 2   },
  { name: 'Arnold Press',                   muscle_group: 'shoulders', equipment: 'dumbbell',   default_increment: 2   },
  { name: 'Lateral Raise',                  muscle_group: 'shoulders', equipment: 'dumbbell',   default_increment: 2   },
  { name: 'Front Raise',                    muscle_group: 'shoulders', equipment: 'dumbbell',   default_increment: 2   },
  { name: 'Rear Delt Fly',                  muscle_group: 'shoulders', equipment: 'dumbbell',   default_increment: 2   },
  { name: 'Incline Dumbbell Reverse Fly',   muscle_group: 'shoulders', equipment: 'dumbbell',   default_increment: 2   },
  { name: 'Incline Y Raises',               muscle_group: 'shoulders', equipment: 'dumbbell',   default_increment: 2   },
  { name: 'Cable Lateral Raise',            muscle_group: 'shoulders', equipment: 'cable',      default_increment: 2.5 },
  // Biceps
  { name: 'Barbell Curl',                   muscle_group: 'biceps',    equipment: 'barbell',    default_increment: 2.5 },
  { name: 'Preacher Curl',                  muscle_group: 'biceps',    equipment: 'barbell',    default_increment: 2.5 },
  { name: 'Dumbbell Curl',                  muscle_group: 'biceps',    equipment: 'dumbbell',   default_increment: 2   },
  { name: 'Hammer Curl',                    muscle_group: 'biceps',    equipment: 'dumbbell',   default_increment: 2   },
  { name: 'Concentration Curl',             muscle_group: 'biceps',    equipment: 'dumbbell',   default_increment: 2   },
  { name: 'Alternating Curl',               muscle_group: 'biceps',    equipment: 'dumbbell',   default_increment: 2   },
  { name: 'Spider Curl',                    muscle_group: 'biceps',    equipment: 'dumbbell',   default_increment: 2   },
  { name: 'Cable Curl',                     muscle_group: 'biceps',    equipment: 'cable',      default_increment: 2.5 },
  // Triceps
  { name: 'Skull Crusher',                  muscle_group: 'triceps',   equipment: 'barbell',    default_increment: 2.5 },
  { name: 'Skull Crushers',                 muscle_group: 'triceps',   equipment: 'dumbbell',   default_increment: 2   },
  { name: 'Close-grip Bench Press',         muscle_group: 'triceps',   equipment: 'barbell',    default_increment: 2.5 },
  { name: 'Overhead Tricep Extension',      muscle_group: 'triceps',   equipment: 'dumbbell',   default_increment: 2   },
  { name: 'Tricep Kickback',                muscle_group: 'triceps',   equipment: 'dumbbell',   default_increment: 2   },
  { name: 'Dips',                           muscle_group: 'triceps',   equipment: 'bodyweight', default_increment: 0   },
  { name: 'Weighted Dips',                  muscle_group: 'triceps',   equipment: 'dumbbell',   default_increment: 2.5 },
  { name: 'Tricep Pushdown',                muscle_group: 'triceps',   equipment: 'cable',      default_increment: 2.5 },
  { name: 'Cable Overhead Extension',       muscle_group: 'triceps',   equipment: 'cable',      default_increment: 2.5 },
  // Legs
  { name: 'Squat',                          muscle_group: 'legs',      equipment: 'barbell',    default_increment: 5   },
  { name: 'Front Squat',                    muscle_group: 'legs',      equipment: 'barbell',    default_increment: 2.5 },
  { name: 'Romanian Deadlift',              muscle_group: 'legs',      equipment: 'barbell',    default_increment: 5   },
  { name: 'Sumo Deadlift',                  muscle_group: 'legs',      equipment: 'barbell',    default_increment: 5   },
  { name: 'Hip Thrust',                     muscle_group: 'legs',      equipment: 'barbell',    default_increment: 5   },
  { name: 'Stiff Legged Deadlift',          muscle_group: 'legs',      equipment: 'barbell',    default_increment: 5   },
  { name: 'Hip Thrust',                     muscle_group: 'legs',      equipment: 'dumbbell',   default_increment: 2   },
  { name: 'Stiff Legged Deadlift',          muscle_group: 'legs',      equipment: 'dumbbell',   default_increment: 2   },
  { name: 'Bulgarian Split Squat',          muscle_group: 'legs',      equipment: 'dumbbell',   default_increment: 2   },
  { name: 'Lunges',                         muscle_group: 'legs',      equipment: 'dumbbell',   default_increment: 2   },
  { name: 'Step-up',                        muscle_group: 'legs',      equipment: 'dumbbell',   default_increment: 2   },
  { name: 'Leg Press',                      muscle_group: 'legs',      equipment: 'machine',    default_increment: 10  },
  { name: 'Hack Squat',                     muscle_group: 'legs',      equipment: 'machine',    default_increment: 5   },
  { name: 'Leg Curl',                       muscle_group: 'legs',      equipment: 'machine',    default_increment: 5   },
  { name: 'Leg Extension',                  muscle_group: 'legs',      equipment: 'machine',    default_increment: 5   },
  { name: 'Calf Raise',                     muscle_group: 'legs',      equipment: 'machine',    default_increment: 5   },
  { name: 'Sissy Squat',                    muscle_group: 'legs',      equipment: 'bodyweight', default_increment: 0   },
  // Core
  { name: 'Plank',                          muscle_group: 'core',      equipment: 'bodyweight', default_increment: 0   },
  { name: 'Crunch',                         muscle_group: 'core',      equipment: 'bodyweight', default_increment: 0   },
  { name: 'Hanging Leg Raise',              muscle_group: 'core',      equipment: 'bodyweight', default_increment: 0   },
  { name: 'Cable Crunch',                   muscle_group: 'core',      equipment: 'cable',      default_increment: 2.5 },
  { name: 'Ab Wheel Rollout',               muscle_group: 'core',      equipment: 'bodyweight', default_increment: 0   },
  // Additional
  { name: 'Reverse Fly',                    muscle_group: 'back',      equipment: 'dumbbell',   default_increment: 2   },
  { name: 'Incline Curl',                   muscle_group: 'biceps',    equipment: 'dumbbell',   default_increment: 2   },
];

const insert = db.prepare(`
  INSERT OR IGNORE INTO exercises (name, muscle_group, equipment, default_increment)
  VALUES (@name, @muscle_group, @equipment, @default_increment)
`);

export function seed() {
  db.transaction(() => { for (const ex of exercises) insert.run(ex); })();
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
  { day: 4, name: 'Dip',                        sets: 2, weight: null },
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
