import {dashboard} from './engine.js';import {initDb,health,closeDb} from './db.js';await initDb();console.log('DB',await health());console.log((await dashboard()).finalDecision);await closeDb();
