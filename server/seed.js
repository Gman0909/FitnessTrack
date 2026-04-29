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
];

const insert = db.prepare(`
  INSERT OR IGNORE INTO exercises (name, muscle_group, equipment, default_increment)
  VALUES (@name, @muscle_group, @equipment, @default_increment)
`);

export function seed() {
  db.transaction(() => { for (const ex of exercises) insert.run(ex); })();
}

// Run directly (npm run setup / node server/seed.js)
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  seed();
  console.log(`Seeded ${exercises.length} exercises`);
  process.exit(0);
}
