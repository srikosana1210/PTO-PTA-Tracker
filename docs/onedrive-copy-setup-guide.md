# OneDrive copy: setup guide

_Oct 1, 2026 · Sri Kosana. This guide goes with [`tools/PTO-PTA-OneDrive-Copy.bat`](../tools/PTO-PTA-OneDrive-Copy.bat)._

One Windows file copies the Google Drive folder where the tracker files documents (**Parent Org Documents**) to OneDrive, one campus folder at a time. It only adds and updates files. It never deletes anything in Google Drive or OneDrive. Set it up once, on one district PC.

## Before you start

- A district Windows PC that is on during the day. The copy only runs while the PC is on and you are signed in.
- Google Drive for desktop, signed in with the Google account that owns the Parent Org folders. That is the account that deployed the tracker script.
- OneDrive, signed in with your Houston ISD account.

## Set up

1. Save `PTO-PTA-OneDrive-Copy.bat` in a folder you will not move, such as Documents. If Windows says it protected your PC, choose **More info**, then **Run anyway**. If the district blocks .bat files, ask HISD IT to allow this one.
2. Open File Explorer and check that Google Drive shows the folder **Parent Org Documents**. It is usually `G:\My Drive\Parent Org Documents`.
3. Double-click the file and choose **1, Preview**. It lists what would be copied and copies nothing. Check that the Google Drive and OneDrive lines at the top show the places you expect.
4. Choose **2, Copy now**. The first run copies everything, so it can take a while.
5. Choose **6** to open the OneDrive folder and check that the campus folders are there.
6. Choose **3** to turn on automatic copying. It runs every 3 hours starting at 7:00 AM, while the PC is on and you are signed in.

## Bank letters share the campus folder

Since October 2, 2026 the tracker files every document in the campus folder, bank letters included. So the copy puts them in the same OneDrive folder as everything else.

The OneDrive folder is set by `DOCS_DEST` at the top of the file (right-click the file, then **Edit**). If that is a shared FACE folder or a SharePoint library, share it only with people who may see bank letters.

If your Google Drive still has the old **Parent Org Bank Info** folder, the file copies it into the same campus folders too, so nothing is missed.

## What to expect

- Google Drive stays the main place. Dashboard links and C1 reviews open the Drive files, so add and review documents there, not in OneDrive.
- Files deleted or renamed in Google Drive stay in OneDrive. A renamed file shows up twice.
- Each OneDrive folder gets a `_Copy status.txt` showing when the last copy ran. The menu shows the same, and whether automatic copying is on.
- Some documents are marked "Could not file" in the Submission Log. They stay in the form's upload folder and are not copied.
- A missed run is not made up. The next run copies everything that is new.

## If something goes wrong

| If you see | Do this |
|---|---|
| Could not find the Parent Org Documents folder | Open Google Drive for desktop and confirm it is signed in with the account that owns the folders. If the folders live in a shared drive or under another drive letter, set `DRIVE_ROOT` at the top of the file. |
| OneDrive was not found on this PC | Sign in to OneDrive with your Houston ISD account, or set `DOCS_DEST` at the top of the file. |
| Windows did not allow automatic copying | Option 2 still works any time. Ask HISD IT if you want it to run by itself. |
| PROBLEM: some files could not be copied | Choose 5 to open the log and look for lines that say ERROR. Common causes are OneDrive being paused or a path that is too long. |
| The last copy date is old | The PC was off or asleep, or automatic copying is OFF in the menu. Choose 2 or 3. |

To stop, choose 4. Deleting the file removes the job entirely. Copies already in OneDrive stay.
