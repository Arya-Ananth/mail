# 📧 Gmail Interview & Next Round Extractor

A Node.js tool to scan your Gmail inbox and extract emails indicating you've been selected for the **next round**, **interview**, or **shortlisted** for job or freelance opportunities.

It filters out rejections automatically and generates a detailed Markdown report and CSV file.

---

## 🛠️ Step-by-Step Setup

### Step 1: Generate a Gmail App Password
Gmail requires an **App Password** for third-party scripts to access email securely when 2-Step Verification is enabled.
1. Go to your [Google Account Security Settings](https://myaccount.google.com/security).
2. Ensure **2-Step Verification** is turned **ON**.
3. Under *How you sign in to Google*, click on **2-Step Verification** and scroll to the bottom to find **App passwords**.
   - *Note: If you don't see it, search for "App passwords" in the search bar at the top of your Google Account page.*
4. Select **App**: *Mail*, and **Device**: *Other (Custom name)* (e.g., name it `Gmail Extractor`).
5. Click **Generate**.
6. Copy the 16-character code displayed in the yellow box (e.g. `abcd efgh ijkl mnop`).

### Step 2: Configure Credentials
You have two ways to configure the credentials:

#### Option A: Quick Configuration (Interactive)
Just run the script directly. It will detect if you are missing credentials and prompt you to paste your Gmail address and 16-character App Password. It will then automatically save them to a `.env` file for future runs.

#### Option B: Manual Configuration
1. Rename `.env.example` to `.env`.
2. Open `.env` and update the values:
   ```env
   GMAIL_EMAIL=your_email@gmail.com
   GMAIL_APP_PASSWORD=abcdefghijklmnop
   ```

---

## 🚀 How to Run

1. Open your terminal/command prompt.
2. Navigate to the project directory:
   ```bash
   cd "C:\Users\anunt\OneDrive\Documents\mail"
   ```
3. Run the script using Node.js:
   ```bash
   node gmail_extractor.js
   ```


---

## ⚙️ Customizing Filters & Settings

You can customize scanning parameters directly inside your `.env` file:

- **`SCAN_DAYS_LIMIT`**: Scan emails from the last $N$ days (default: `30`).
- **`SCAN_MAX_EMAILS`**: Stop after checking $N$ matching-date emails to save bandwidth (default: `200`).
- **`INCLUDE_KEYWORDS`**: Comma-separated list of terms indicating selection/next steps.
- **`EXCLUDE_KEYWORDS`**: Comma-separated list of terms indicating rejection or general info to ignore.

---

## 📊 Outputs Generated

After the script runs, it generates two files in the workspace directory:
1. **`selected_emails_report.md`**: A detailed and clean Markdown report containing:
   - Summary table of all selections.
   - Exact email subject, date, sender, and matched keywords.
   - Text previews of each email body.
2. **`selected_emails.csv`**: A spreadsheet-compatible file containing all parsed fields (perfect for importing to Excel or Google Sheets).
