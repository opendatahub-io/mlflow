# Missing Tests — MCP Registry Pagination/Search/Filter

## Currently Covered

| Feature | Test Name | File |
|---|---|---|
| Table renders pagination controls | `renders pagination controls` | `MCPServerListTable.test.tsx` |
| Table Next callback fires | `calls onNextPage when Next is clicked` | `MCPServerListTable.test.tsx` |
| Table Previous callback fires | `calls onPreviousPage when Previous is clicked` | `MCPServerListTable.test.tsx` |
| API receives `max_results=25` | `sends max_results query parameter to the API` | `MCPRegistryPage.test.tsx` |
| Pagination resets on search filter change | `resets pagination when search filter changes` | `MCPRegistryPage.test.tsx` |
| Search text converted to ILIKE filter | `converts plain text search into a valid name filter` | `MCPRegistryPage.test.tsx` |
| Card grid loading state | `renders loading spinner when isLoading is true` | `MCPServerCardGrid.test.tsx` |
| Card grid filtered empty state | `renders "No servers found" when filtered and no results` | `MCPServerCardGrid.test.tsx` |
| Card grid renders cards | `renders a card for each server` | `MCPServerCardGrid.test.tsx` |

## Missing Tests

### 1. Page size selector renders in grid view

**File:** `MCPRegistryPage.test.tsx`

**What to test:** When servers exist and the page renders, the page size dropdown (showing "25 / page") appears in the grid view.

**Why it matters:** Verifies the `pageSizeSelect` prop is wired from the hook through to `CursorPagination` at the page level.

---

### 2. Page size selector renders in table/list view

**File:** `MCPRegistryPage.test.tsx`

**What to test:** Switch to list view, verify the page size dropdown appears inside the table's pagination area.

**Why it matters:** Same as above but for the list view path.

---

### 3. Pagination controls render in grid view

**File:** `MCPRegistryPage.test.tsx`

**What to test:** When the API returns `next_page_token`, "Previous" and "Next" buttons appear in the grid view (pagination is rendered at the page level, outside `MCPServerCardGrid`).

**Why it matters:** Grid pagination was moved from inside the component to the page — need to verify it's wired correctly.

---

### 4. Page size change resets pagination to page 1

**File:** `MCPRegistryPage.test.tsx` or new hook test file

**What to test:** Navigate to page 2 (click Next), then change page size via the dropdown. The next API call should have `page_token=null` (reset to page 1).

**Why it matters:** Validates the `pageSizeSelect.onChange` handler clears `currentPageToken` and `previousPageTokens`.

---

### 5. Previous page navigation pops from token stack

**File:** New `useMCPServersListQuery.test.ts` (hook unit test)

**What to test:** Go to page 2 (pushes token onto stack), go to page 3 (pushes again), click Previous — should pop the stack and use the page 2 token.

**Why it matters:** The `previousPageTokens` ref-based stack is the core of back-navigation and has no direct test.

---

### 6. SQL passthrough — advanced filter syntax not modified

**File:** `MCPRegistryPage.test.tsx`

**What to test:** Type `status = 'active'` in the search box. The API should receive `filter_string=status = 'active'` (not wrapped in ILIKE).

**Why it matters:** `buildSearchFilterClause` detects SQL keywords and passes them through; this path isn't tested.

---

### 7. `keepPreviousData` — old data visible while loading new page

**File:** `MCPRegistryPage.test.tsx`

**What to test:** Render page with servers visible. Change the search filter. Before the new response arrives, the old servers should still be visible (not replaced by skeleton/loading).

**Why it matters:** Validates the `keepPreviousData: true` option eliminates the flash.

**Note:** This is harder to test because it requires intercepting the timing between request and response (can use MSW's `delay`).

---

### 8. Search debounce — API not called on every keystroke

**File:** `MCPRegistryPage.test.tsx`

**What to test:** Type "abc" quickly. The API should only be called once (after 500ms debounce), not 3 times.

**Why it matters:** Validates the `useDebounce(searchFilter, 500)` is working.

---

### 9. Page size persisted to localStorage

**File:** New `useMCPServersListQuery.test.ts` (hook unit test)

**What to test:** Change page size to 50. Unmount and remount the hook. The initial page size should be 50 (read from localStorage).

**Why it matters:** Validates the `useLocalStorage` persistence for page size selection.

---

## Priority

| Priority | Tests |
|---|---|
| High | #3 (grid pagination renders), #4 (page size resets pagination), #5 (previous page stack) |
| Medium | #1 (page size selector grid), #2 (page size selector table), #6 (SQL passthrough) |
| Low | #7 (keepPreviousData timing), #8 (debounce), #9 (localStorage persistence) |
