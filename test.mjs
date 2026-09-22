import {QUESTIONS} from './questions.mjs';import assert from 'node:assert/strict';
assert.equal(QUESTIONS.length,96);assert.equal(new Set(QUESTIONS.map(q=>q.id)).size,96);for(const q of QUESTIONS){assert(q.text&&q.answer&&q.source);assert(['easy','medium','hard'].includes(q.difficulty))}console.log('نجح الاختبار: 96 سؤالًا بمعرّفات فريدة.');
