# PGM FITNESS – Firestore ഡാറ്റാ ഘടനയും Migration പദ്ധതിയും

ഈ രേഖ development പദ്ധതിയാണ്. ഇപ്പോഴത്തെ live app-ലോ APK-യിലോ ഇത് പ്രയോഗിച്ചിട്ടില്ല.

## Collections

### users/{uid}
- role: "staff"
- active: true/false
- displayName
- createdAt
- createdBy

Owner UID rules-ൽ നിശ്ചയിച്ചതാണ്. Client-ൽ നിന്ന് Owner role സൃഷ്ടിക്കാനാവില്ല.

### members/{memberId}
അംഗത്തിന്റെ നിലവിലെ profile മാത്രം:
- name, phone, address, gender, photo
- joinDate, plan, planFee, expiryDate, status, notes
- createdAt, createdBy, updatedAt, updatedBy

ഇവിടെ payment history array സൂക്ഷിക്കരുത്.

### payments/{paymentId}
ഓരോ തവണ പണം സ്വീകരിക്കുമ്പോഴും പുതിയ document:
- memberId, memberNameSnapshot
- amount, date, payMode
- kind: "joining" | "pending_fee" | "renewal"
- createdAt, createdBy

### renewals/{renewalId}
ഓരോ renewal-നും പുതിയ document:
- memberId, memberNameSnapshot
- plan, amount, startDate, expiryDate, payMode
- createdAt, createdBy

### attendance/{attendanceId}
- memberId, memberNameSnapshot
- date, checkInAt
- createdAt, createdBy

### expenses/{expenseId} (Owner only)
- title, amount, date, category, notes
- createdAt, createdBy, updatedAt, updatedBy

### settings/main (Owner only)
- openingBalance, gymName, currency, preferences
- updatedAt, updatedBy

## Legacy data mapping

നിലവിലെ localStorage key: `pgm_fitness_data`.

- `members[]` → ഓരോ അംഗത്തിനും `members/{id}`.
- അംഗത്തിലെ ആദ്യ `amount/date/payMode` → ഒരു "joining" payment document.
- അംഗത്തിലെ `payments[]` → ലഭിച്ച ഓരോ തുകയ്ക്കും `payments`-ൽ വേറെ payment document; `type: "Renewal"` ആണെങ്കിൽ `kind: "renewal"`.
- അംഗത്തിലെ `renewals[]` → renewal കരാറിന്റെ/പ്ലാനിന്റെ വിശദാംശങ്ങൾ `renewals`-ൽ വേറെ document.
- Renewal-ന്റെ `paidAmount` പലപ്പോഴും `payments[]`-ലും കാണാം. `payments` യഥാർത്ഥത്തിൽ ലഭിച്ച പണത്തിന്റെ ledger ആണ്; `renewals` renewal fee/കാലാവധി വിവരമാണ്. വരുമാനം കണക്കാക്കുമ്പോൾ `renewals.paidAmount` വീണ്ടും കൂട്ടരുത്; ഇല്ലെങ്കിൽ ഒരേ പണം ഇരട്ടിയായി എണ്ണപ്പെടും.
- `expenses[]` → expenses collection (Owner only).
- `openingBalance` → settings/main.

## Migration സുരക്ഷാ ക്രമം

1. Owner login സ്ഥിരീകരിക്കുക.
2. നിലവിലെ localStorage JSON-ന്റെ backup ഫയൽ export ചെയ്ത് ഉപയോക്താവിന് download/verify ചെയ്യാൻ അനുവദിക്കുക.
3. JSON parse ചെയ്ത് എണ്ണം, പേരുകൾ, തുകകൾ, തീയതികൾ എന്നിവ പരിശോധിക്കുക; ഒന്നും മാറ്റരുത്.
4. ഓരോ record-നും സ്ഥിരമായ migration ID ഉണ്ടാക്കി duplicate തടയുക.
5. ആദ്യം Firestore-ലേക്ക് എഴുതുക; എഴുതിയ എണ്ണവും തുകയും local source-നോട് താരതമ്യം ചെയ്യുക.
6. പരിശോധന വിജയിച്ചാൽ മാത്രമേ Cloud data-യെ primary ആക്കാവൂ.
7. Local data ഉടൻ മായ്ക്കരുത്. Owner വ്യക്തമായി സ്ഥിരീകരിക്കുന്നതുവരെ പഴയ ഡാറ്റ നിലനിർത്തുക.
8. Migration വീണ്ടും ഓടിച്ചാലും duplicate records ഉണ്ടാകരുത്.

## നിർബന്ധമായ പരിശോധനകൾ

- Unauthenticated user: എല്ലാ business collections-ലും deny.
- Unknown account: deny.
- Inactive staff: deny.
- Staff 1 / Staff 2: അംഗ profile-ൽ അനുവദിച്ച fields മാത്രം മാറ്റാം.
- Staff: `payments`-ൽ joining/pending_fee/renewal payment രേഖകൾ create ചെയ്യാം; `renewals`-ൽ renewal രേഖ create ചെയ്യാം; update/delete പാടില്ല.
- Staff: expenses, settings, financialReports വായിക്കാനോ മാറ്റാനോ പാടില്ല.
- Owner: പൂർണ്ണ access.
- Owner-ന് മാത്രം backup/restore, staff activation/deactivation, audit review.

## നിലവിലെ നില

ഇത് schema-യും migration-ഉം നിർവചിക്കുന്ന specification മാത്രമാണ്. Login UI, Firestore adapter, automated rules tests, migration runner, backup/restore, cloud sync എന്നിവ ഇനിയും implement ചെയ്യേണ്ടതാണ്. Rules publish ചെയ്യരുത്; live data ചേർക്കരുത്; APK uninstall/clear storage ചെയ്യരുത്.


## Read-only Migration Pre-check

Development branch-ൽ `migration-preview.js` ചേർത്തിട്ടുണ്ട്. ഇത് raw backup JSON സ്വീകരിച്ച് അംഗങ്ങൾ, ആദ്യ payment എണ്ണം, payment rows/തുക, renewal rows/paid തുക, expenses/തുക, opening balance എന്നിവയുടെ summary നൽകുന്നു. Duplicate member IDs, പേരില്ലാത്ത അംഗങ്ങൾ, വലിയ photo data, അസാധുവായ തുകകൾ എന്നിവ warnings ആയി കാണിക്കും.

ഇത് preview മാത്രം ആണ്: localStorage-ലോ Firestore-ലോ എഴുതില്ല; migration നടത്തുകയുമില്ല. നിലവിലെ UI-യുമായി ബന്ധിപ്പിച്ചിട്ടില്ല. Cloud migration തുടങ്ങുന്നതിന് മുമ്പ് ഇതിന്റെ output പരിശോധിക്കുകയും യഥാർത്ഥ legacy data-യിൽ edge-case tests നടത്തുകയും വേണം.
