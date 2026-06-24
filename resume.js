const PDFDocument = require('pdfkit');
const fs = require('fs');
const readline = require('readline');
const https = require('https');

const GROQ_API_KEY = "ENTER UR API KEY";

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (q) => new Promise(res => rl.question(q, res));

async function callGroq(prompt) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model: "llama-3.3-70b-versatile",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 1000
    });

    const options = {
      hostname: 'api.groq.com',
      path: '/openai/v1/chat/completions',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${GROQ_API_KEY}`,
        'Content-Length': Buffer.byteLength(body)
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.choices && json.choices[0]) {
            resolve(json.choices[0].message.content);
          } else {
            console.log("Groq error:", JSON.stringify(json));
            resolve(null);
          }
        } catch (e) {
          reject(e);
        }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function drawLine(doc) {
  doc.moveTo(50, doc.y).lineTo(545, doc.y).lineWidth(0.5).strokeColor('#333333').stroke();
}

function section(doc, title) {
  doc.moveDown(0.6);
  doc.fontSize(11).font('Helvetica-Bold').fillColor('#1a1a2e').text(title.toUpperCase());
  drawLine(doc);
  doc.moveDown(0.3);
  doc.fontSize(10).font('Helvetica').fillColor('#000000');
}

function generatePDF(data, tailored) {
  const doc = new PDFDocument({ margin: 50, size: 'A4' });
  doc.pipe(fs.createWriteStream('resume.pdf'));

  // Dark header
  doc.rect(0, 0, 595, 90).fill('#1a1a2e');
  doc.fontSize(26).font('Helvetica-Bold').fillColor('#ffffff')
    .text(data.name, 50, 22, { align: 'center' });
  doc.fontSize(9).font('Helvetica').fillColor('#cccccc')
    .text(`${data.email}   |   ${data.contact}   |   github.com/${data.github}   |   linkedin.com/in/${data.linkedin}`, 50, 58, { align: 'center' });

  doc.y = 105;
  doc.fillColor('#000000');

  // Education
  section(doc, 'Education');
  doc.font('Helvetica-Bold').text(data.college, { continued: true });
  doc.font('Helvetica').text(`   |   CGPA: ${data.cgpa}`);
  doc.moveDown(0.2);
  doc.text(`12th  —  ${data.twelfth}`);
  doc.text(`10th  —  ${data.tenth}`);

  // Summary
  section(doc, 'Professional Summary');
  doc.text(tailored.summary, { lineGap: 3 });

  // Technical Skills
  section(doc, 'Technical Skills');
  const techSkills = (Array.isArray(tailored.skills) ? tailored.skills : tailored.skills.split(',')).map(s => s.trim());
  techSkills.forEach(s => {
    doc.text(`• ${s}`, { lineGap: 2 });
  });

  // Soft Skills
  section(doc, 'Soft Skills');
  const softSkills = data.soft.split(',').map(s => s.trim());
  softSkills.forEach(s => {
    doc.text(`• ${s}`, { lineGap: 2 });
  });

  // Internship
  section(doc, 'Internship');
  data.internship.split(',').forEach(i => {
    const parts = i.split(':');
    if (parts[0]?.trim()) {
      doc.font('Helvetica-Bold').text(parts[0].trim(), { continued: true });
      doc.font('Helvetica').text(`   —   ${parts[1]?.trim() || ''}   (${parts[2]?.trim() || ''})`);
      doc.moveDown(0.2);
    }
  });

  // Projects
  section(doc, 'Projects');
  tailored.projects.split('\n').forEach(p => {
    if (!p.trim()) return;
    const [name, ...rest] = p.split(':');
    doc.font('Helvetica-Bold').text(`• ${name.trim()}`, { continued: !!rest.length });
    if (rest.length) doc.font('Helvetica').text(`:  ${rest.join(':').trim()}`);
    doc.moveDown(0.3);
  });

  // Achievements
  section(doc, 'Achievements');
  data.achievements.split(',').forEach(a => {
    if (a.trim()) {
      doc.text(`• ${a.trim()}`, { lineGap: 2 });
    }
  });

  doc.end();
  console.log("\n✅ resume.pdf created successfully!");
}

async function main() {
  console.log("\n Resume Builder with AI Tailoring\n");

  let profile = {};
  const profilePath = 'profile.json';

  if (fs.existsSync(profilePath)) {
    profile = JSON.parse(fs.readFileSync(profilePath));
    console.log("Loaded saved profile.\n");
  } else {
    profile = {
      name: await ask("Full Name: "),
      email: await ask("Email: "),
      github: await ask("GitHub ID: "),
      contact: await ask("Contact Number: "),
      linkedin: await ask("LinkedIn URL: "),
      college: await ask("College Name: "),
      cgpa: await ask("Current CGPA: "),
      tenth: await ask("10th School & Marks: "),
      twelfth: await ask("12th School & Marks: "),
      technical: await ask("Technical Skills (comma separated): "),
      soft: await ask("Soft Skills (comma separated): "),
      achievements: await ask("Achievements (comma separated): "),
      projects: await ask("Projects (name:description, comma separated): "),
      internship: await ask("Internship (company:role:duration): "),
    };
    fs.writeFileSync(profilePath, JSON.stringify(profile, null, 2));
    console.log("\nProfile saved to profile.json\n");
  }

  console.log("\nPaste the Job Description (press Enter twice when done):");
  let jd = '';
  let prev = '';
  for await (const line of rl) {
    if (line === '' && prev === '') break;
    jd += line + '\n';
    prev = line;
  }

  rl.close();

  console.log("\nAI is tailoring your resume...");

  const prompt = `You are a resume expert. Based on this job description and the candidate's ACTUAL profile below, tailor the resume. Do NOT invent or hallucinate any projects or experience. Only use what is provided.

Job Description:
${jd}

Candidate's ACTUAL Profile:
- Technical Skills: ${profile.technical}
- Projects: ${profile.projects}
- Internship: ${profile.internship}
- Achievements: ${profile.achievements}

Return ONLY valid JSON, no markdown, no backticks:
{"summary":"2-3 sentence professional summary using only real skills","skills":"most relevant comma separated skills from candidate's actual list","projects":"only real projects from the list, one per line as: name: description"}`;

  const response = await callGroq(prompt);

  let tailored;
  try {
    const cleaned = response.replace(/```json|```/g, '').trim();
    tailored = JSON.parse(cleaned);
  } catch (e) {
    console.log("Using default content.");
    tailored = {
      summary: `Motivated student with experience in ${profile.technical.split(',')[0].trim()} seeking opportunities to contribute.`,
      skills: profile.technical,
      projects: profile.projects.split(',').join('\n')
    };
  }

  generatePDF(profile, tailored);
}

main();