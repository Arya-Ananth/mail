const fs = require('fs');
const readline = require('readline');
const imapSimple = require('imap-simple');
const simpleParser = require('mailparser').simpleParser;
require('dotenv').config();

const ENV_FILE = '.env';
const DEFAULT_SCAN_DAYS = 30;
const DEFAULT_SCAN_MAX = 200;

// Refined keywords indicating selection for the next round
const DEFAULT_INCLUDE = [
    "next round", "shortlisted", "short-listed", "selected for", 
    "technical test", "technical assessment", "move forward", 
    "moving forward", "next steps", "phone screen", "first round", 
    "second round", "technical screen", "coding test", "coding challenge", 
    "schedule an interview", "schedule a call", "schedule a chat", 
    "schedule our call", "invitation to interview", "interview invitation"
];

// Refined exclude keywords targeting rejections and general notifications
const DEFAULT_EXCLUDE = [
    // Rejection keywords
    "unfortunately", "not moving forward", "thank you for your time",
    "not selected", "decided to go with", "regret to inform",
    "we will not be moving", "rejected", "reject", "unable to offer",
    // Marketing / Prep (common false positives)
    "interview prep", "interview preparation", "interview tips", 
    "mock interview", "practice interview", "interview questions",
    // Digest & newsletter patterns
    "digest", "newsletter", "weekly review", "daily review", "job recommendation",
    "job alert", "jobs for you", "new jobs", "suggested jobs", "weekly update",
    "weekly challenge", "weekly contest", "contest results", "someone viewed",
    "connection request", "verification code", "reset password", "security alert",
    "sign-in attempt"
];

// Helper to ask user questions in console
function askQuestion(query) {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });
    return new Promise(resolve => {
        rl.question(query, ans => {
            rl.close();
            resolve(ans.trim());
        });
    });
}

function saveEnv(email, appPassword) {
    const content = `# Gmail Credentials
GMAIL_EMAIL=${email}
GMAIL_APP_PASSWORD=${appPassword}

# Scan Settings
SCAN_DAYS_LIMIT=${DEFAULT_SCAN_DAYS}
SCAN_MAX_EMAILS=${DEFAULT_SCAN_MAX}

# Keywords
INCLUDE_KEYWORDS=${DEFAULT_INCLUDE.join(',')}
EXCLUDE_KEYWORDS=${DEFAULT_EXCLUDE.join(',')}
`;
    fs.writeFileSync(ENV_FILE, content, 'utf8');
}

async function getCredentials() {
    let email = process.env.GMAIL_EMAIL;
    let appPassword = process.env.GMAIL_APP_PASSWORD;

    if (!email || !appPassword || email.includes('your_email@gmail.com')) {
        console.log("\n" + "=".repeat(60));
        console.log(" GMAIL credentials missing or incomplete in .env file.");
        console.log(" Please follow these steps to generate a secure App Password:");
        console.log(" 1. Go to your Google Account (https://myaccount.google.com)");
        console.log(" 2. Go to Security -> 2-Step Verification (must be enabled)");
        console.log(" 3. Scroll to the bottom and click 'App passwords'");
        console.log(" 4. Select App: 'Mail', Device: 'Other', name it (e.g. 'Gmail Extractor')");
        console.log(" 5. Copy the 16-character password generated.");
        console.log("=".repeat(60) + "\n");

        email = await askQuestion("Enter your Gmail address: ");
        let rawPassword = await askQuestion("Enter your Gmail App Password (16 characters): ");
        appPassword = rawPassword.replace(/\s+/g, ""); // strip spaces

        if (email && appPassword) {
            saveEnv(email, appPassword);
            console.log(`\nSaved credentials to ${ENV_FILE} for future use.\n`);
            // reload env
            require('dotenv').config({ path: ENV_FILE });
        } else {
            console.log("Credentials cannot be empty. Exiting.");
            process.exit(1);
        }
    }
    return { email, appPassword };
}

function isAutomatedNotification(fromAddr, subject) {
    const fromLower = fromAddr.toLowerCase();
    const subjectLower = subject.toLowerCase();

    // Subject checks (newsletter/contests/digests)
    const digestPatterns = [
        "digest", "newsletter", "weekly review", "daily review", "job recommendation",
        "job alert", "jobs for you", "new jobs", "suggested jobs", "weekly update",
        "weekly challenge", "weekly contest", "contest results", "someone viewed",
        "connection request", "verification code", "reset password", "security alert",
        "bootcamp", "webinar", "masterclass", "course invitation", "register for",
        "course", "tutorial", "learning", "training", "seminar", "workshop", "event",
        "hackathon"
    ];
    for (const pattern of digestPatterns) {
        if (subjectLower.includes(pattern)) {
            return { isAuto: true, reason: `Subject contains digest pattern: '${pattern}'` };
        }
    }

    // Domain checking
    const emailMatch = fromLower.match(/<([^>]+)>/) || [null, fromLower];
    const emailStr = emailMatch[1] || fromLower;
    const domain = emailStr.split('@')[1] || '';

    // Ed-tech and coding platforms blocked completely
    const completelyBlockedDomains = [
        "leetcode.com", "codeforces.com", "kaggle.com", "scaler.com", 
        "intellipaat.com", "skillsbuild.org", "medium.com", "substack.com", 
        "youtube.com", "twitter.com", "x.com", "facebook.com", "instagram.com", 
        "quora.com", "glassdoor.com"
    ];
    if (completelyBlockedDomains.some(cbd => domain.includes(cbd))) {
        return { isAuto: true, reason: `Blocked ed-tech/platform domain: ${domain}` };
    }

    // Shared notification domains where personal messages could exist, but automated notifications are blocked
    const notificationDomains = [
        "linkedin.com", "github.com", "indeed.com", "upwork.com"
    ];
    if (notificationDomains.some(nd => domain.includes(nd))) {
        const automatedPrefixes = [
            "noreply", "no-reply", "notification", "digest", "alert", 
            "news", "jobs-listings", "messages-noreply", "member", "do-not-reply"
        ];
        if (automatedPrefixes.some(prefix => emailStr.startsWith(prefix))) {
            return { isAuto: true, reason: `Automated sender from ${domain}: ${emailStr}` };
        }
    }

    return { isAuto: false, reason: "" };
}

function filterEmail(subject, body, includeKw, excludeKw, fromAddr) {
    // 1. Run automated notification filter
    const { isAuto, reason } = isAutomatedNotification(fromAddr, subject);
    if (isAuto) {
        return { isMatch: false, reason };
    }

    const subjectLower = subject.toLowerCase();
    const bodyLower = body.toLowerCase();
    const combinedText = `${subjectLower} ${bodyLower}`;

    // 2. Check exclusion keywords
    for (const kw of excludeKw) {
        if (combinedText.includes(kw.trim().toLowerCase())) {
            return { isMatch: false, reason: `Matched exclusion: '${kw}'` };
        }
    }

    // 3. Check inclusion keywords
    const matchedIncludes = [];
    for (const kw of includeKw) {
        if (combinedText.includes(kw.trim().toLowerCase())) {
            matchedIncludes.push(kw.trim());
        }
    }

    if (matchedIncludes.length > 0) {
        return { isMatch: true, reason: matchedIncludes };
    }

    return { isMatch: false, reason: "No inclusion keywords matched" };
}

function cleanHtml(htmlContent) {
    if (!htmlContent) return "";
    // Basic stripping of HTML tags
    let text = htmlContent
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, ' ')
        .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, ' ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/gi, ' ')
        .replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>')
        .replace(/&amp;/gi, '&')
        .replace(/&quot;/gi, '"')
        .replace(/\s+/g, ' ')
        .trim();
    return text;
}

function getBodyContent(body) {
    if (typeof body === 'string' || Buffer.isBuffer(body)) {
        return Promise.resolve(body);
    }
    return new Promise((resolve, reject) => {
        let chunks = [];
        body.on('data', chunk => {
            chunks.push(chunk);
        });
        body.on('end', () => {
            resolve(Buffer.concat(chunks));
        });
        body.on('error', err => {
            reject(err);
        });
    });
}

function saveResults(results, scannedCount, matchCount, sinceDate, daysLimit) {
    // 1. Write CSV
    const csvFile = 'selected_emails.csv';
    const csvHeader = 'id,date,from,subject,keywords,body_preview\n';
    const csvRows = results.map(r => {
        const escape = str => `"${str.replace(/"/g, '""')}"`;
        return `${r.id},${escape(r.date)},${escape(r.from)},${escape(r.subject)},${escape(r.keywords)},${escape(r.body_preview)}`;
    }).join('\n');
    fs.writeFileSync(csvFile, csvHeader + csvRows, 'utf8');

    // 2. Write Markdown Report
    const reportFile = 'selected_emails_report.md';
    let md = `# 📩 Gmail Interview & Next Round Selections (Node.js)\n\n`;
    md += `**Report Generated:** ${new Date().toLocaleString()}\n`;
    md += `- **Scan window:** Last ${daysLimit} days (since ${sinceDate})\n`;
    md += `- **Total emails scanned:** ${scannedCount}\n`;
    md += `- **Matched selections:** ${matchCount}\n\n`;

    if (matchCount === 0) {
        md += `> ℹ️ No matching selection emails were found in the scanned range.\n`;
    } else {
        md += `## Summary Table\n\n`;
        md += `| Date | From | Subject | Matched Keywords |\n`;
        md += `| --- | --- | --- | --- |\n`;
        results.forEach(r => {
            const cleanFrom = r.from.replace(/\|/g, '-');
            const cleanSubj = r.subject.replace(/\|/g, '-');
            md += `| ${r.date.slice(0, 16)} | ${cleanFrom} | ${cleanSubj} | \`${r.keywords}\` |\n`;
        });

        md += `\n## Detailed Matches\n\n`;
        results.forEach((r, i) => {
            md += `### ${i + 1}. ${r.subject}\n`;
            md += `- **Date:** ${r.date}\n`;
            md += `- **From:** ${r.from}\n`;
            md += `- **Keywords:** \`${r.keywords}\`\n\n`;
            md += `**Preview:**\n> ${r.body_preview}\n\n`;
            md += `---\n\n`;
        });
    }

    fs.writeFileSync(reportFile, md, 'utf8');
    console.log(`\nReport written to: ${reportFile}`);
    console.log(`Data saved to: ${csvFile}`);
}

async function runExtraction() {
    const { email, appPassword } = await getCredentials();

    const daysLimit = parseInt(process.env.SCAN_DAYS_LIMIT) || DEFAULT_SCAN_DAYS;
    const maxEmails = parseInt(process.env.SCAN_MAX_EMAILS) || DEFAULT_SCAN_MAX;

    const includeKw = process.env.INCLUDE_KEYWORDS ? process.env.INCLUDE_KEYWORDS.split(',') : DEFAULT_INCLUDE;
    const excludeKw = process.env.EXCLUDE_KEYWORDS ? process.env.EXCLUDE_KEYWORDS.split(',') : DEFAULT_EXCLUDE;

    const dateLimit = new Date();
    dateLimit.setDate(dateLimit.getDate() - daysLimit);
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const sinceDate = `${dateLimit.getDate()}-${months[dateLimit.getMonth()]}-${dateLimit.getFullYear()}`;

    const config = {
        imap: {
            user: email,
            password: appPassword,
            host: 'imap.gmail.com',
            port: 993,
            tls: true,
            authTimeout: 5000,
            tlsOptions: { rejectUnauthorized: false }
        }
    };

    console.log(`\nConnecting to Gmail IMAP server for ${email}...`);
    let connection;
    try {
        connection = await imapSimple.connect(config);
        console.log("Successfully logged in.");
    } catch (err) {
        console.error(`\nError connecting/authenticating with Gmail: ${err.message}`);
        console.error("Please verify your Gmail address and verify that the 16-character App Password is correct.");
        process.exit(1);
    }

    try {
        await connection.openBox('INBOX');
        console.log(`Scanning emails since ${sinceDate} (up to ${maxEmails} emails)...`);

        const searchCriteria = [['SINCE', sinceDate]];
        // Fetch only headers initially to save bandwidth and memory
        const fetchOptions = {
            bodies: ['HEADER.FIELDS (SUBJECT FROM DATE)'],
            markSeen: false
        };

        const messages = await connection.search(searchCriteria, fetchOptions);
        let totalFound = messages.length;
        console.log(`Found ${totalFound} total emails in the last ${daysLimit} days.`);

        if (totalFound === 0) {
            console.log("No emails found in the specified range. Exiting.");
            connection.end();
            return;
        }

        // Sort messages from newest to oldest
        messages.reverse();
        const messagesToScan = messages.slice(0, maxEmails);
        console.log(`Scanning the newest ${messagesToScan.length} emails for selections...`);

        const results = [];
        let scannedCount = 0;
        let matchCount = 0;

        for (const message of messagesToScan) {
            scannedCount++;
            if (scannedCount % 10 === 0) {
                console.log(`Scanned ${scannedCount}/${messagesToScan.length} emails...`);
            }

            try {
                // Get header data
                const headerPart = message.parts.find(part => part.which.includes('HEADER'));
                if (!headerPart) continue;

                // Directly extract parsed headers
                const subject = headerPart.body.subject ? headerPart.body.subject[0] : "";
                const from = headerPart.body.from ? headerPart.body.from[0] : "";
                const date = headerPart.body.date ? headerPart.body.date[0] : "";

                // Proactively check if email is automated using headers
                const { isAuto } = isAutomatedNotification(from, subject);
                if (isAuto) {
                    // Skip downloading body for automated alerts/digests/marketing
                    continue;
                }

                // Fetch full body for this specific message UID
                const uid = message.attributes.uid;
                const fullMsgQuery = await connection.search([['UID', uid]], { bodies: [''] });
                if (!fullMsgQuery || fullMsgQuery.length === 0) continue;

                const rawPart = fullMsgQuery[0].parts.find(part => part.which === '');
                if (!rawPart) continue;

                // Safely resolve the raw body (string, Buffer, or stream)
                const bodyData = await getBodyContent(rawPart.body);
                const parsedFull = await simpleParser(bodyData);
                const textBody = parsedFull.text || "";
                const htmlBody = parsedFull.html || "";
                
                const body = textBody || cleanHtml(htmlBody);

                const { isMatch, reason: matchReason } = filterEmail(subject, body, includeKw, excludeKw, from);

                if (isMatch) {
                    matchCount++;
                    results.push({
                        id: uid,
                        date: date,
                        from: from,
                        subject: subject,
                        keywords: matchReason.join(', '),
                        body_preview: body.slice(0, 300).replace(/\r?\n|\r/g, " ").trim() + "..."
                    });
                    console.log(`  [MATCH #${matchCount}] From: ${from.slice(0, 30)} | Subject: ${subject.slice(0, 40)}`);
                }
            } catch (err) {
                console.error(`Error parsing email UID ${message.attributes.uid}: ${err.message}`);
            }
        }

        connection.end();
        console.log(`\nScan completed. Scanned: ${scannedCount}. Matches: ${matchCount}.`);

        saveResults(results, scannedCount, matchCount, sinceDate, daysLimit);

    } catch (err) {
        console.error(`An error occurred during scanning: ${err.message}`);
        if (connection) connection.end();
    }
}

runExtraction();
