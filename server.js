const express = require('express');
const fs = require('fs');
const csv = require('csv-parser');
const app = express();
const PORT = 3000;

app.use(express.static('public'));
app.use(express.json());

// --- 🔒 กำหนดรายชื่อหัวหน้างาน (Leaders) ที่ต้องประชุมวันอังคาร คาบ 8 ---
const LEADER_IDS = [
    'T01', // ครูประจิตร์
    'T03', // ครูพิชญะ
    'T06', // ครูเบญญาภา
    'T08', // ครูกรรัก
    'T09', // ครูปรารถนา
    'T10', // ครูปานจันทร์
    'T11', // ครูนรังสวรรค์
    'T17'  // ครูพัฒนา
];

// --- Global Data ---
let data = {
    teachers: [], rooms: [], groups: [], subjects: [],
    teach: [], timeslot: [], register: []
};

// --- Helper Functions ---
const cleanData = (obj) => {
    const newObj = {};
    for (let key in obj) {
        const cleanKey = key.trim().replace(/^\ufeff/, '');
        newObj[cleanKey] = typeof obj[key] === 'string' ? obj[key].trim() : obj[key];
    }
    return newObj;
};

const generateStandardTimeslots = () => {
    const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
    const slots = [];
    let idCounter = 1;
    days.forEach(day => {
        for (let period = 1; period <= 12; period++) {
            slots.push({
                timeslot_id: idCounter++,
                day: day,
                period: period.toString(),
                start: `${8 + (period - 1)}:00`,
                end: `${9 + (period - 1)}:00`
            });
        }
    });
    return slots;
};

// --- Data Loading ---
const loadCSV = (fileName) => {
    return new Promise((resolve) => {
        const results = [];
        if (!fs.existsSync(fileName)) { resolve([]); return; }
        fs.createReadStream(fileName)
            .pipe(csv({ mapHeaders: ({ header }) => header.trim() }))
            .on('data', (row) => results.push(cleanData(row)))
            .on('end', () => resolve(results));
    });
};

const loadAllData = async () => {
    console.log("📂 Loading Data...");
    data.teachers = await loadCSV('teacher.csv');
    data.rooms = await loadCSV('room.csv');
    data.groups = await loadCSV('student_group.csv');
    data.subjects = await loadCSV('subject.csv');
    data.teach = await loadCSV('teach.csv');
    data.register = await loadCSV('register.csv');
    
    // Load or Generate Timeslots
    const loadedTimeslots = await loadCSV('timeslot.csv');
    const hasPeriod12 = loadedTimeslots.some(t => parseInt(t.period) === 12);
    if (loadedTimeslots.length === 0 || !hasPeriod12) {
        data.timeslot = generateStandardTimeslots();
    } else {
        data.timeslot = loadedTimeslots;
    }

    // แสดงผลการตรวจสอบ Leader ที่หน้า Console
    console.log("------------------------------------------------");
    console.log(`👨‍🏫 ตรวจสอบรายชื่อหัวหน้างาน (Leaders) จำนวน ${LEADER_IDS.length} ท่าน:`);
    LEADER_IDS.forEach(id => {
        const t = data.teachers.find(teacher => teacher.teacher_id === id);
        const name = t ? t.teacher_name : "ไม่พบชื่อ";
        console.log(`   - ${name} (${id}) -> 🔒 ล็อคเวลาประชุม: อังคาร คาบ 8`);
    });
    console.log("------------------------------------------------");
};

// --- Smart Scheduler Engine ---
class SmartScheduler {
    constructor() {
        this.schedule = [];
        this.conflictCount = 0;
    }

    canPlace(slot, teacherId, roomId, groupId, usedMap) {
        const tid = slot.timeslot_id;
        
        // 1. ตรวจสอบการชนกันของทรัพยากร (Conflict Check)
        if (usedMap.teacher.has(`${teacherId}-${tid}`)) return false;
        if (usedMap.room.has(`${roomId}-${tid}`)) return false;
        if (usedMap.group.has(`${groupId}-${tid}`)) return false;

        // 2. ตรวจสอบเงื่อนไขหัวหน้างาน (Leader Constraint)
        // ถ้าเป็นวันอังคาร (Tue) และคาบ 8
        if (slot.day === 'Tue' && parseInt(slot.period) === 8) {
            // ถ้าครูคนนี้อยู่ในรายชื่อ LEADER_IDS ให้ตอบ false (ห้ามลงสอน)
            if (LEADER_IDS.includes(teacherId)) {
                return false; 
            }
        }

        return true;
    }

    findConsecutiveSlots(needed, allSlots, usedMap, teacher, room, group, maxPeriod) {
        // สุ่มลำดับวันเพื่อกระจายวิชาไม่ให้กระจุกตัว
        const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'].sort(() => 0.5 - Math.random());
        
        for (let day of days) {
            const daySlots = allSlots
                .filter(s => s.day === day)
                .sort((a,b) => parseInt(a.period) - parseInt(b.period));
            
            for (let i = 0; i <= daySlots.length - needed; i++) {
                const candidateSlots = [];
                let valid = true;

                for (let k = 0; k < needed; k++) {
                    const s = daySlots[i+k];
                    const p = parseInt(s.period);

                    // เงื่อนไข 1: ห้ามเกินคาบที่กำหนด (เช่น รอบแรกหาแค่ 1-8)
                    if (p > maxPeriod) { valid = false; break; }

                    // เงื่อนไข 2: ห้ามลงคาบพักเที่ยง (คาบ 5)
                    if (p === 5) { valid = false; break; }

                    // เงื่อนไข 3: วิชาต่อเนื่องต้องคาบติดกัน
                    if (k > 0 && p !== parseInt(candidateSlots[k-1].period) + 1) { 
                        valid = false; break; 
                    }

                    // เงื่อนไข 4: ตรวจสอบ Conflict และ Leader
                    if (!this.canPlace(s, teacher, room, group, usedMap)) {
                        valid = false; break;
                    }
                    
                    candidateSlots.push(s);
                }

                if (valid) return candidateSlots;
            }
        }
        return null;
    }

    generate() {
        let tempSchedule = [];
        let conflicts = 0;
        
        const usedMap = {
            teacher: new Set(),
            room: new Set(),
            group: new Set()
        };

        // 1. เตรียมงานสอน (Jobs)
        let jobs = [];
        data.register.forEach(reg => {
            const subj = data.subjects.find(s => s.subject_id === reg.subject_id);
            if (!subj) return;
            
            // แยกวิชาปฏิบัติ (ก้อนใหญ่)
            if (parseInt(subj.practice) > 0) {
                jobs.push({ 
                    ...reg, 
                    type: 'Practice', 
                    slots: parseInt(subj.practice), 
                    subjName: subj.subject_name 
                });
            }
            // แยกวิชาทฤษฎี (แตกเป็นคาบละ 1 ชม.)
            const theoryCount = parseInt(subj.theory);
            for(let i=0; i<theoryCount; i++) {
                jobs.push({ 
                    ...reg, 
                    type: 'Theory', 
                    slots: 1, 
                    subjName: subj.subject_name 
                });
            }
        });

        // เรียงลำดับงานยาก (ปฏิบัติคาบเยอะ) ให้ลงก่อน
        jobs.sort((a, b) => b.slots - a.slots);

        // 2. เริ่มจัดตาราง
        jobs.forEach(job => {
            // A. หาครูผู้สอน
            const validTeachers = data.teach.filter(t => t.subject_id === job.subject_id).map(t => t.teacher_id);
            const teacher = validTeachers.length > 0 ? validTeachers[0] : (data.teachers[0]?.teacher_id || 'T_UNK');

            // B. หาห้องเรียน (แยกประเภท ทฤษฎี/ปฏิบัติ)
            const isTheory = job.type === 'Theory';
            
            // กรองห้อง: ทฤษฎีต้องลงห้อง Theory, ปฏิบัติต้องลงห้องที่ไม่ใช่ Theory
            let possibleRooms = data.rooms.filter(r => {
                if (isTheory) return r.room_type === 'Theory';
                else return r.room_type !== 'Theory'; 
            });

            // ถ้าหาห้องตรงประเภทไม่ได้ ให้ใช้ห้องอะไรก็ได้ (กันระบบตัน)
            if (possibleRooms.length === 0) possibleRooms = data.rooms;

            // สุ่มเลือกห้อง
            const roomCandidate = possibleRooms.sort(() => 0.5 - Math.random())[0];
            const room = roomCandidate ? roomCandidate.room_id : 'R_UNK';

            // C. หาช่วงเวลา (Priority Logic)
            
            // รอบที่ 1: พยายามลงในคาบ 1-8 ก่อน
            let slots = this.findConsecutiveSlots(job.slots, data.timeslot, usedMap, teacher, room, job.group_id, 8);

            // รอบที่ 2: ถ้าไม่ได้ ให้หาถึงคาบ 12
            if (!slots) {
                slots = this.findConsecutiveSlots(job.slots, data.timeslot, usedMap, teacher, room, job.group_id, 12);
            }

            // รอบที่ 3: ถ้าไม่ได้จริงๆ (Conflict) ให้ Force ลงเพื่อแจ้งเตือน
            let isConflict = false;
            if (!slots) {
                isConflict = true;
                conflicts++;
                // หาที่ว่างทางกายภาพ (ไม่สนคนชน)
                slots = this.findConsecutiveSlots(job.slots, data.timeslot, { teacher: new Set(), room: new Set(), group: new Set() }, teacher, room, job.group_id, 12);
            }

            if (slots) {
                slots.forEach(s => {
                    const tid = s.timeslot_id;
                    if (!isConflict) {
                        usedMap.teacher.add(`${teacher}-${tid}`);
                        usedMap.room.add(`${room}-${tid}`);
                        usedMap.group.add(`${job.group_id}-${tid}`);
                    }
                    
                    tempSchedule.push({
                        group_id: job.group_id,
                        subject_id: job.subject_id,
                        teacher_id: teacher,
                        room_id: room,
                        timeslot_id: s.timeslot_id,
                        day: s.day,
                        period: s.period,
                        is_conflict: isConflict
                    });
                });
            }
        });

        this.schedule = tempSchedule;
        return conflicts;
    }

    exportCSV() {
        const header = "group_id,timeslot_id,day,period,subject_id,teacher_id,room_id\n";
        const rows = this.schedule.map(s => 
            `${s.group_id},${s.timeslot_id},${s.day},${s.period},${s.subject_id},${s.teacher_id},${s.room_id}`
        ).join("\n");
        fs.writeFileSync('output.csv', header + rows);
    }
}

// --- API Routes ---
app.get('/api/options', (req, res) => res.json({ 
    groups: data.groups, 
    teachers: data.teachers, 
    rooms: data.rooms,
    subjects: data.subjects 
}));

app.get('/api/schedule', (req, res) => {
    if (fs.existsSync('output.csv')) {
        const results = [];
        fs.createReadStream('output.csv').pipe(csv()).on('data', (d) => results.push(d)).on('end', () => res.json(results));
    } else { res.json([]); }
});

// --- Main Execution ---
loadAllData().then(() => {
    console.log("🧠 AI is Optimizing Schedule...");
    console.log("   - Constraint: Priority Period 1-8");
    console.log("   - Constraint: Strict Room Types (Theory vs Practice)");
    console.log(`   - Constraint: Block Leaders (Tue P8) for ${LEADER_IDS.join(', ')}`);

    // Run Optimization Loop (50 รอบเพื่อหาผลลัพธ์ที่ดีที่สุด)
    let bestEngine = null;
    let minConflicts = Infinity;
    const ATTEMPTS = 50; 

    for(let i=0; i<ATTEMPTS; i++) {
        const engine = new SmartScheduler();
        const conf = engine.generate();
        
        if (conf === 0) {
            bestEngine = engine;
            minConflicts = 0;
            break; 
        }

        if (conf < minConflicts) {
            minConflicts = conf;
            bestEngine = engine;
        }
    }

    console.log(`✅ AI Finished! Best Result: ${minConflicts} conflicts.`);
    if (bestEngine) bestEngine.exportCSV();

    app.listen(PORT, () => console.log(`🚀 Server running at http://localhost:${PORT}`));
});