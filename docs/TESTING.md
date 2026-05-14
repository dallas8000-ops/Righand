# RigHand AI - Testing Guide

## 📋 Before You Start

- [ ] Backend running on http://localhost:5000
- [ ] Frontend running on http://localhost:3000
- [ ] Modern browser (Chrome, Firefox, Safari, Edge)
- [ ] Internet connection (or offline for testing)

---

## 🎯 Test Scenario 1: Demo Mode (5 minutes)

**Objective:** Verify application works without backend

### Steps:
1. Navigate to http://localhost:3000
2. Click **"Demo Mode"** button
3. Verify you're logged in as "Demo Trucker"
4. Check dashboard shows:
   - ✅ Profit cards (Income, Expenses, Net)
   - ✅ "Add Expense/Income" button
   - ✅ Expense history table (empty initially)

### Expected Results:
- Demo mode logs in instantly
- Dashboard is fully functional
- All UI elements are visible and responsive

---

## 🎯 Test Scenario 2: User Registration (5 minutes)

**Objective:** Test new user registration

### Steps:
1. Navigate to http://localhost:3000
2. Page shows login form
3. Fill registration form:
   - Email: `test@righand.ai`
   - Password: `Test123!@#`
   - Name: `John Smith`
   - License: `CDL456789`
4. Click **"Register"** button
5. Wait for response

### Expected Results:
- ✅ Registration successful
- ✅ Redirected to dashboard
- ✅ Logged in with new account
- ✅ Dashboard is empty (no expenses yet)

### If it fails:
- Check backend is running
- Check for error message
- Verify all fields are filled
- Check browser console for errors

---

## 🎯 Test Scenario 3: Add Expense (5 minutes)

**Objective:** Test expense creation

### Steps:
1. On dashboard, click **"+ Add Expense/Income"**
2. Fill form:
   - Description: `Fuel stop at Pilot`
   - Amount: `125.50`
   - Type: `Expense`
   - Category: `Fuel`
   - Date: `Today's date`
3. Click **"Save Entry"**
4. Verify expense appears in table

### Expected Results:
- ✅ Form appears/disappears correctly
- ✅ Expense added to table
- ✅ "Synced" status shows
- ✅ Amount appears correctly in table

### Test Different Categories:
- [ ] Fuel
- [ ] Maintenance
- [ ] Tolls
- [ ] Food/Hotel
- [ ] Other
- [ ] Load (Income)

---

## 🎯 Test Scenario 4: Add Income (3 minutes)

**Objective:** Test income tracking

### Steps:
1. Click **"+ Add Expense/Income"**
2. Fill form:
   - Description: `Load payment - Chicago delivery`
   - Amount: `850.00`
   - Type: **Income**
   - Category: `Load`
   - Date: `Today`
3. Click **"Save Entry"**

### Expected Results:
- ✅ Income appears with green "↓ Income" badge
- ✅ Amount shows as positive in table
- ✅ Monthly Income card updates

---

## 🎯 Test Scenario 5: Profit Calculation (3 minutes)

**Objective:** Test profit calculation accuracy

### Setup:
1. Add these entries:
   - Income: $800 (Load)
   - Expense: $100 (Fuel)
   - Expense: $50 (Tolls)

### Expected Results:
- **Monthly Income**: $800
- **Total Expenses**: $150
- **Net Profit**: $650 (positive/green)

### Verify Math:
- [ ] Income calculation is correct
- [ ] Expense total is correct
- [ ] Net profit = Income - Expenses

---

## 🎯 Test Scenario 6: Filter Expenses (5 minutes)

**Objective:** Test filtering functionality

### Steps:
1. Add multiple expenses of different categories
2. Use **"All Types"** filter:
   - Select "Expenses Only"
   - Verify income entries disappear
   - Select "Income Only"
   - Verify expense entries disappear
   - Select "All Types" again

3. Use **Category** filter:
   - Select "Fuel"
   - Verify only fuel expenses show
   - Select other categories one by one

### Expected Results:
- ✅ Filters work correctly
- ✅ Non-matching items are hidden
- ✅ Table updates instantly
- ✅ Can reset filters

---

## 🎯 Test Scenario 7: Update Expense (5 minutes)

**Objective:** Test expense modification

### Steps:
1. Add an expense for $100
2. Click **"Delete"** (🗑 button)
3. Confirm deletion
4. Verify expense is removed from table

### Alternative - Manual Update:
1. Add expense: "Fuel - $100"
2. If app supports edit:
   - Click expense
   - Change amount to $120
   - Save
   - Verify amount updates

### Expected Results:
- ✅ Deletion confirmation works
- ✅ Expense disappears from table
- ✅ Profit recalculates

---

## 🎯 Test Scenario 8: Offline Mode (10 minutes)

**Objective:** Test offline data persistence and sync

### Setup:
1. Ensure several expenses are already created
2. Open DevTools (F12 or Cmd+Option+I)
3. Go to **Network** tab

### Steps:
1. Click throttle dropdown (top-left of Network tab)
2. Select **"Offline"**
3. Browser shows "offline" indicator

4. Add new expense offline:
   - Description: `Offline test expense`
   - Amount: `99.99`
   - Category: `Other`
   - Click Save

5. Expected: Should see **"⧖ Pending Sync"** status

6. Go back to **Network** tab
7. Click throttle dropdown and select **"No throttling"**
8. Browser comes back online

9. Expected: Should see **"✓ Synced"** status

### Expected Results:
- ✅ Can add expenses while offline
- ✅ Sync status shows "Pending Sync"
- ✅ Expense remains in table
- ✅ Auto-syncs when online
- ✅ Status changes to "Synced"
- ✅ Data persists across page reloads

### Verify Persistence:
1. While offline, refresh page (Ctrl+R)
2. Expected: Offline expense still visible
3. Go online
4. Expected: Auto-syncs to backend

---

## 🎯 Test Scenario 9: Session Persistence (5 minutes)

**Objective:** Test login persistence

### Steps:
1. Log in or use Demo Mode
2. Add some expenses
3. **Refresh page** (Ctrl+R or Cmd+R)
4. Expected: Still logged in, expenses visible

5. **Close browser tab** and reopen
6. Navigate to http://localhost:3000
7. Expected: Still logged in (if localStorage intact)

### Expected Results:
- ✅ Session persists on page refresh
- ✅ Data remains accessible
- ✅ No need to login again

---

## 🎯 Test Scenario 10: Data Validation (5 minutes)

**Objective:** Test form validation

### Steps:
1. Try adding expense with:
   - [ ] No description (should error)
   - [ ] No amount (should error)
   - [ ] Negative amount (should not add)
   - [ ] Future date (should accept)
   - [ ] Past date (should accept)
   - [ ] Special characters in description (should accept)

### Expected Results:
- ✅ Required fields show error
- ✅ Invalid amounts rejected
- ✅ Valid edge cases accepted
- ✅ No crashes or console errors

---

## 🎯 Test Scenario 11: Responsive Design (5 minutes)

**Objective:** Test mobile responsiveness

### Steps:
1. Open DevTools (F12)
2. Click **"Toggle device toolbar"** (Ctrl+Shift+M)
3. Select **iPhone 12** from dropdown
4. Test all pages:
   - [ ] Login form fits screen
   - [ ] Dashboard accessible
   - [ ] Buttons are clickable
   - [ ] Profit cards stack vertically
   - [ ] Table is scrollable

5. Test on tablet view:
   - Select **iPad** from dropdown
   - Verify layout is balanced

### Expected Results:
- ✅ No horizontal scrolling needed
- ✅ Text is readable
- ✅ Buttons are easily tappable
- ✅ Layout adapts to screen size

---

## 🎯 Test Scenario 12: Error Handling (5 minutes)

**Objective:** Test application resilience

### Steps - Network Error:
1. Stop backend (Ctrl+C in backend terminal)
2. Try adding an expense
3. Expected error message appears
4. Expense still saves locally (offline mode)

### Steps - Invalid Data:
1. Open browser console (F12)
2. Try to break the app by:
   - [ ] Very large numbers
   - [ ] Special characters
   - [ ] Empty form submission
   - [ ] Rapid clicks

### Expected Results:
- ✅ No crashes
- ✅ User-friendly error messages
- ✅ Application stays responsive
- ✅ Data integrity maintained

---

## 🎯 Test Scenario 13: Performance (5 minutes)

**Objective:** Check application performance

### Steps:
1. Open DevTools (F12)
2. Go to **Performance** tab
3. Click **Record**
4. Perform actions:
   - Add 10 expenses
   - Switch filters multiple times
   - Scroll table
5. Stop recording
6. Analyze performance metrics

### Expected Results:
- ✅ Page load < 2 seconds
- ✅ Button clicks respond instantly
- ✅ No lag when scrolling
- ✅ Profit updates immediately
- ✅ Memory usage stable

---

## 🎯 Test Scenario 14: Cross-Browser Testing (10 minutes)

**Objective:** Verify app works across browsers

Test on each browser:

### Chrome
- [ ] Login/logout works
- [ ] Expenses load correctly
- [ ] Profit calculates
- [ ] Offline mode works

### Firefox
- [ ] Same as Chrome

### Safari (if on Mac)
- [ ] Same as Chrome

### Edge (if on Windows)
- [ ] Same as Chrome

### Expected Results:
- ✅ Application works consistently
- ✅ No browser-specific bugs
- ✅ Styles render correctly

---

## 📋 Complete Test Checklist

### Core Functionality
- [ ] Demo mode works
- [ ] Registration works
- [ ] Login works
- [ ] Logout works
- [ ] Add expense works
- [ ] Add income works
- [ ] Delete expense works
- [ ] Update expense works (if supported)

### Calculations
- [ ] Monthly income calculated correctly
- [ ] Total expenses calculated correctly
- [ ] Net profit = Income - Expenses
- [ ] Multiple entries calculated correctly

### Offline
- [ ] Offline detection works
- [ ] Offline data saved locally
- [ ] Sync queue shows pending
- [ ] Auto-sync when online
- [ ] Data persists after refresh

### UI/UX
- [ ] All buttons clickable
- [ ] Forms validate input
- [ ] Error messages clear
- [ ] Success messages shown
- [ ] Loading states visible
- [ ] Responsive on mobile

### Performance
- [ ] Fast initial load
- [ ] Instant button response
- [ ] Smooth scrolling
- [ ] No memory leaks
- [ ] Efficient sync

### Data Integrity
- [ ] No data loss
- [ ] Correct calculations
- [ ] Proper validation
- [ ] Secure storage

---

## 🐛 Bug Report Template

If you find a bug, document:

```
Title: [Descriptive title]

Steps to Reproduce:
1. [First step]
2. [Second step]
3. [Etc]

Expected Result:
[What should happen]

Actual Result:
[What actually happened]

Browser: [Chrome/Firefox/Safari/Edge]
OS: [Windows/Mac/Linux]
Environment: [Development/Production]

Screenshots:
[If applicable]

Console Errors:
[If applicable - F12 → Console tab]
```

---

## ✅ Final Sign-Off

Once all tests pass:

- [ ] Demo mode fully functional
- [ ] User registration works
- [ ] Expense tracking complete
- [ ] Offline mode verified
- [ ] Mobile responsive
- [ ] Cross-browser compatible
- [ ] No critical bugs
- [ ] Performance acceptable
- [ ] Data integrity maintained
- [ ] Ready for production

---

## 📞 Support

If tests fail or issues occur:

1. Check [SETUP.md](SETUP.md) troubleshooting section
2. Review [API.md](API.md) for expected responses
3. Check browser console for errors (F12)
4. Verify backend is running
5. Try clearing cache and restarting

---

**Test Date**: ___________  
**Tested By**: ___________  
**Result**: ✅ Pass / ❌ Fail  
**Notes**: _________________________________

