/**
 * @file SprintFilter.js
 * @description Provides filtering functionality for the Current Sprint KPI card
 */

/**
 * Filters the table to show only items in the current sprint
 * Clears previous filters first, then expands epics that contain sprint items
 */
function filterCurrentSprintItems() {
  // Clear any existing filters first
  clearAllFilters();
  
  // Get the current sprint name from the KPI data
  const sprintStats = app.data.sprintStats || {};
  const currentSprintName = sprintStats.currentSprintName;
  
  if (!currentSprintName || currentSprintName === 'None') {
    showToast('No current sprint found');
    return;
  }
  
  // Build a list of IDs for items in the current sprint
  const itemsInCurrentSprint = [];
  const epicParents = new Set();
  
  // Check all projects and independent tasks
  const allItems = [...(app.data.projects || []), ...(app.data.independentTasks || [])];
  
  allItems.forEach(item => {
    const itemSprints = (item.sprint && typeof item.sprint === 'string') 
      ? item.sprint.split(',').map(s => s.trim()) 
      : [];
    
    // Check if this item is in the current sprint
    const isInCurrentSprint = itemSprints.some(sprint => 
      sprint.includes(currentSprintName)
    );
    
    if (isInCurrentSprint) {
      // Add this item to our filtered list
      itemsInCurrentSprint.push(item['Jira #'] || item.ID);
      
      // If this item has an epic parent, add the epic to the list of parents to expand
      if (item['Epic Link']) {
        epicParents.add(item['Epic Link']);
      }
    }
  });
  
  // Apply the filter
  if (itemsInCurrentSprint.length > 0) {
    // Set the UI to show only items in the current sprint
    setActiveFilter(`Items in current sprint: ${currentSprintName}`);
    
    // Show only the items in the current sprint (and their parent epics)
    app.tableRows.forEach(row => {
      const itemId = row.data['Jira #'] || row.data.ID;
      const isEpic = epicParents.has(itemId);
      const isInSprint = itemsInCurrentSprint.includes(itemId);
      
      // Show this row if it's in the sprint or is a parent epic
      row.element.style.display = (isInSprint || isEpic) ? '' : 'none';
      
      // Expand epics that contain sprint items
      if (isEpic && row.isExpandable) {
        expandRow(row);
      }
    });
    
    showToast(`Showing ${itemsInCurrentSprint.length} items in current sprint: ${currentSprintName}`);
  } else {
    showToast('No items found in the current sprint');
  }
}

/**
 * Note: This function assumes the following existing functions are available:
 * - clearAllFilters(): Clears any existing filters
 * - setActiveFilter(text): Sets the active filter text in the UI
 * - showToast(message): Shows a notification message
 * - expandRow(row): Expands a table row if it's collapsible
 * 
 * Make sure to adjust this function to match your existing codebase.
 */
