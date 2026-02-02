const fs = require('fs');
const csv = require('csv-parser');

// --- Configuration ---
const POPULATION_SIZE = 10;
const MAX_GENERATIONS = 100; // ลดจำนวนลงเพื่อทดสอบก่อน
const MUTATION_RATE = 0.1;

// --- Data Storage ---
const data = {
    teachers: [],
    rooms: [],
    groups: [],
    subjects: [],
    teach: [],
    timeslot: [],
    register: []
};

// ฟังก์ชันช่วยลบช่องว่าง (Trim Whitespace) จากข้อมูล
const cleanData = (obj) => {
    const newObj = {};
    for (let key in obj) {
        // ลบช่องว่างที่ชื่อ Column และ ค่าข้อมูล
        const cleanKey = key.trim();
        const value = obj[key];
        newObj[cleanKey] = typeof value === 'string' ? value.trim() : value;
    }
    return newObj;
};

// --- 1. Data Loading Section ---
const loadCSV = (fileName) => {
    return new Promise((resolve) => {
        const results = [];
        if (!fs.existsSync(fileName)) {
            console.error(`❌ Error: File not found -> ${fileName}`);
            resolve([]);
            return;
        }
        
        fs.createReadStream(fileName)
            .pipe(csv({ 
                mapHeaders: ({ header }) => header.trim() // ลบช่องว่างที่ Header ทันที
            })) 
            .on('data', (row) => results.push(cleanData(row))) // Clean ข้อมูลทุกแถว
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
    data.timeslot = await loadCSV('timeslot.csv');
    data.register = await loadCSV('register.csv');
    
    // Debug: เช็คจำนวนข้อมูล
    console.log(`✅ Loaded Summary:`);
    console.log(`- Teachers: ${data.teachers.length}`);
    console.log(`- Subjects: ${data.subjects.length}`);
    console.log(`- Registers: ${data.register.length}`);
    console.log(`- Rooms: ${data.rooms.length}`);
    console.log(`- Timeslots: ${data.timeslot.length}`);
    
    if(data.register.length === 0) console.warn("⚠️ Warning: register.csv is empty!");
};

// --- 2. AI / Logic Section ---

class ScheduleGA {
    constructor() {
        this.population = [];
    }

    generateChromosome() {
        let schedule = [];
        
        // Debug: ลองเช็คคู่แรกดูว่าเจอกันไหม
        let matchCount = 0;

        data.register.forEach((reg, index) => {
            // ค้นหา Subject Info
            const subject = data.subjects.find(s => s.subject_id === reg.subject_id);
            
            if(!subject) {
                if(index < 3) console.warn(`⚠️ Mismatch: Subject ID '${reg.subject_id}' form register not found in subject.csv`);
                return; // ข้ามวิชานี้ไปถ้าหาไม่เจอ
            }

            matchCount++;

            // คำนวณจำนวนคาบ
            const theorySlots = parseInt(subject.theory || 0);
            const practiceSlots = parseInt(subject.practice || 0);
            const totalSlots = theorySlots + practiceSlots;

            // หาครู
            const validTeachers = data.teach
                .filter(t => t.subject_id === reg.subject_id)
                .map(t => t.teacher_id);
            
            let teacherId = validTeachers.length > 0 
                ? validTeachers[Math.floor(Math.random() * validTeachers.length)] 
                : (data.teachers.length > 0 ? data.teachers[0].teacher_id : 'T_Unknown');

            for (let i = 0; i < totalSlots; i++) {
                if(data.timeslot.length === 0 || data.rooms.length === 0) break;

                const randomSlot = data.timeslot[Math.floor(Math.random() * data.timeslot.length)];
                const randomRoom = data.rooms[Math.floor(Math.random() * data.rooms.length)];

                schedule.push({
                    group_id: reg.group_id,
                    subject_id: reg.subject_id,
                    teacher_id: teacherId,
                    timeslot_id: randomSlot.timeslot_id,
                    day: randomSlot.day,
                    period: randomSlot.period,
                    room_id: randomRoom.room_id
                });
            }
        });
        
        // Debug: ถ้าจัดตารางแล้วว่างเปล่า ให้แจ้งเตือน
        if(schedule.length === 0 && this.population.length === 0) {
             console.error("❌ Critical: Generated schedule is empty. Likely due to ID mismatch.");
        }

        return schedule;
    }

    calculateFitness(schedule) {
        // (Logic เดิม) ลดความซับซ้อนเพื่อ Test ให้ผ่านก่อน
        return 1; 
    }

    async run() {
        await loadAllData();

        if (data.register.length === 0 || data.subjects.length === 0) {
            console.error("⛔ STOP: Missing required data (register or subject). Check file names.");
            return;
        }

        console.log("🧬 Initializing Population...");
        const firstSchedule = this.generateChromosome();
        
        if (firstSchedule.length === 0) {
            console.log("❌ Failed to generate any schedule. Please check the 'Mismatch' warnings above.");
            return;
        }

        // สมมติว่าได้ตารางที่ดีที่สุดมาเลย (เพื่อ Test Output)
        this.exportCSV(firstSchedule);
    }

    exportCSV(schedule) {
        if (!schedule || schedule.length === 0) {
            console.log("⚠️ Nothing to export.");
            return;
        }

        const header = "group_id,timeslot_id,day,period,subject_id,teacher_id,room_id\n";
        const rows = schedule.map(s => 
            `${s.group_id},${s.timeslot_id},${s.day},${s.period},${s.subject_id},${s.teacher_id},${s.room_id}`
        ).join("\n");

        fs.writeFileSync('output.csv', header + rows);
        console.log(`💾 Success! Schedule saved to output.csv with ${schedule.length} rows.`);
    }
}

// --- Run ---
const app = new ScheduleGA();
app.run();