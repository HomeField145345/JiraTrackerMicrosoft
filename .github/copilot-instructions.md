# GitHub Copilot Workspace System Instructions: Brand Design System Standards

## 1. Core Color System & Token Mapping Matrices
### 1.1 Color Variables & Surface Definitions
- **Primary Canvas Background Surfaces**: White (`#FFFFFF`) represents the default light surface mode canvas layout configuration. Black (`#000000`) represents the default dark surface mode canvas layout configuration.
- **Secondary Backgrounds**: Use Gray 95 (`#F6F6F6`) for light containers and Gray 11 (`#1B1D1F` / `#181D1F`) for dark containers. Never use the dark secondary color as a full-page surface background color.
- **Primary Elements UI Tokens**: Front-end elements (typography, system icons, interactive borders) must resolve to Black (`#000000`) when rendered on light surfaces. Front-end elements must resolve to White (`#FFFFFF`) when rendered on dark surfaces.
- **Secondary Elements UI Tokens**: Use Gray 44 (`#6F7171`) on light surfaces to add conversational subtlety and configure hierarchical subtext layers. Use Gray 65 (`#A7A7A7`) on dark surfaces to achieve identical contrast parameters. Never assign secondary element tokens to primary messaging content arrays.
- **Low Contrast UI Tokens**: Use Gray 85 (`#D8DADA`) on light surface areas and Gray 20 (`#333333`) on dark surface areas. Restrict low-contrast token rendering purely to layout dividing rule lines and component borders; never apply low contrast fills to typography.

### 1.2 Vivid Red (Brand Highlight Highlights) Rules
- **Token Hex Code Value**: Vivid Red is strictly locked to hex value `#EE0000` across all digital assets. Maps directly to code parameters `vds.color.background.brandhighlight` and `vds.color.elements.brandhighlight`.
- **System Frequency Ceiling**: Render Vivid Red minimally on any singular web layout (maximum 1 to 2 focal assertions total per full viewport row frame) to maximize visual value and shield user emphasis.
- **Typography Interface Contrast Limits**: Set typography layout strings in clear White over a Vivid Red background layer. It is completely banned to place Black text over a Vivid Red structural surface container.
- **Dark Surface Visibility Exclusion**: Highlight text layers, indicator dots, or custom element borders in Vivid Red strictly when positioned over light background modes. Do not overlay Vivid Red variables onto black or dark gray canvases because the ratio is completely unperceivable to users with color-deficient vision properties.

### 1.3 System Feedback Matrix Tokens
- **Error Status Configurations**: Apply Orange 41 (`#B95319` over light background `#FFECEO`) on light surfaces. Apply Orange 58 (`#FF8027` over dark background `#561701`) on dark surfaces.
- **Warning Status Configurations**: Apply Yellow 53 (`#FED60E`) across all layouts. Paired background container values match `#FFF9DE` (Light surface) and `#4B3F04` (Dark surface).
- **Information Status Configurations**: Apply Blue 38 (`#006FC1` over light background `#E3F2FD`) on light surfaces, and Blue 46 (`#0089EC` over dark background `#002C4D`) on dark surfaces.
- **Success Status Configurations**: Apply Green 26 (`#008331` over light background `#DCF5E6`) on light surfaces, and Green 36 (`#00B845` over dark background `#003514`) on dark surfaces.

---

## 2. Layout, Math Grid Foundations, & Spacing Scales
### 2.1 The 4px Multiplier System Matrix
- **Core Layout Spacing Multiplier**: Generate padding dimensions, gap rules, and grid positions exclusively using a basic 4-pixel increment baseline model (`4px`).
- **Internal Component Spacing Steps**:
  - `1X` = 4px (`vds.layout.space.1X`)
  - `2X` = 8px (`vds.layout.space.2X`)
  - `3X` = 12px (`vds.layout.space.3X`)
  - `4X` = 16px (`vds.layout.space.4X`)
  - `6X` = 24px (`vds.layout.space.6X`)
  - `8X` = 32px (`vds.layout.space.8X`)
  - `12X` = 48px (`vds.layout.space.12X`)
- **Page Architecture Extension Dividers**: For full block segment separation rules, implement `16X` (64px), `24X` (96px), and `32X` (128px) structural margins.
- **Pure Whitespace Separation Mandate**: Separate component grids by introducing mathematical empty white layout margins; do not write structural gray divider canvas lines between sections unless explicitly requested.

### 2.2 Structural View Width Boundaries & Max Width Lock
- **Fluid Layout Window Boundary**: Structural regions (Page Heroes, Section components, Section Hero blocks) behave fluid full-bleed up to a screen display ceiling width of 1600px.
- **Desktop Maximum Layout Lock**: Once screen resolutions expand past 1601px wide, constrain master layouts completely to a 1600px fixed width (`max-width: 1600px`) and center-align the viewport row container cleanly.
- **Media Inset Canvas Rules**: Render component layout graphics within an explicit nested `inset` mask container structure in typical workflows to visually map an indentation parent-child data dependency model. Avoid forcing inset frames if content zones contain complex copy arrays or data charts.

---

## 3. Shape & Outlines Corner Radii
- **Tiles & Tilelet Layout Boxes**: Assign a fixed `12px` border-radius variable across all view styles (`vds.shape.cornerradius.tiles`).
- **Page Hero & Section Hero Canvas Elements**: Assign a fixed `24px` border-radius variable across desktop width configurations (`vds.shape.cornerradius.heroes`).
- **Fluid Window Edge Reset**: Force an absolute corner rounding suppression override (`border-radius: 0px`) for any component layers or blocks that extend flat into active external page browser margins.
- **Circles, Standalone Fills, Icons, & Badges**: Configure circular targets with a relative boundary layout parameter value of `9999px` (`vds.shape.cornerradius.circle`).
- **Rule Lines Finishing Style**: Keep rule dividing lines clean and rectilinearly sharp; do not apply smoothed round edges to layout border line definitions.

---

## 4. Master Typography Mechanics & Casing Ratios
- **Core Font Assets Family**: Use corporate typeface Neue Haas Grotesk (`Verizon NHG`) exclusively.
- **Operational Sizes Matrix**:
  - `Display / eDisplay font weight variants`: Render for large typography assets sized 13px up to 32px+ (Titles, Subtitle parameters, Hero expressions).
  - `eText font weight variants`: Render for tight reading text blocks, grid charts, and legal micro labels sized 12px or smaller.
- **Master Flow Alignment Default**: Default text items must always align left (`text-align: left`). Reserve centralized text formatting options completely for marketing or editorial context canvas areas.

### 4.1 Layout Interaction Configuration Logic (Monologue vs. Dialogue)
Determine headline weights and semantic context properties by evaluating the workflow state:
1. **Monologue (Marketing Assertions)**: Applied to open shopping discovery frameworks, category indexes, or standard homepage sections. Title lockup structures execute using strict **bold font typography weights** to match an editorial tone designed to attract, persuade, and sell.
2. **Dialogue (Transactional Assertions)**: Applied to interactive shopping carts, checkout forms, custom parameter fields, or localized user bill tool dashboards. Title lockup structures execute using strict **regular/light font typography weights** to construct an approachable, simple, plainspoken human tone. Subtitles inside dialogue flows adapt to a **secondary neutral gray color token fill style** to guarantee crisp text scale hierarchies.

---

## 5. Core Component Architectural Execution Rules

### 5.1 Accordions
- **Component Anatomy**: Composed of Accordion Item, optional Top Line, Accordion Header container (Title string, optional Subtitle), Trigger control, Accordion Detail box, child Text rows, and optional Bottom Line.
- **Header Trigger Controls**: Output an icon arrow trigger indicator by default across layout viewports. Use customized inline text link parameters only on interactive checkout configuration steps where extra functional action keywords clarify tasks. Text link labels are limited to 15 characters max (`Change` for collapsed, `Cancel` for expanded).
- **Trigger Spatial Alignment**: Center the trigger item right-justified along the top axis by default. Align triggers to the absolute middle axis exclusively on custom component cards where thumbnail product images or media symbols layout to the left of copy grids to maintain text line alignment parity.
- **Expansion State Rules**: Initialize with `multi-open` logic by default when content structures are brief or rely on parallel data lookups. Transition to a restrictive `single-open` mechanism on heavy informational modules to minimize data overload and prevent tedious window scroll behaviors.
- **Line & Border Visibility Handling**: Avoid stacking adjacent lines. Strip the top boundary separator cleanly if the accordion sits underneath tab arrays that already render a baseline line component. Hide top lines when parent contextual copy introduces the component directly. Always show bottom lines to create clean component boundaries unless the module maps to terminal viewport rows or page footers.
- **Typography Layout Weights**: Enforce regular/light text styling inside header items by default. Apply bold styling parameters exclusively to structure headers containing immense data strings or to force readability inside deep, multi-tiered child layout charts.

### 5.2 Badges
- **Component Anatomy**: Built as a visual status label or supplemental descriptor via an enclosed container block and a flat typography label string.
- **Color Mapping States**:
  - `Red (Brand Default)`: Restricted to display positive, brand-related, or plan-included privileges or product value states.
  - `Green`: Validation success or transaction confirmations.
  - `Blue`: General supplementary info flags or non-critical notification data entries.
  - `Yellow`: Conditional warning metrics that users may voluntarily review or dismiss.
  - `Orange`: Operational error exceptions requiring complete user intervention to advance.
- **Interaction Fencing**: Never append cursor hover actions, click listeners, or event pointers to badges—badges are indicator components, never active buttons or clickable shortcuts. Restrict layout configurations to a strict maximum parameter limit of 1 badge per component module card. Sizing evaluates automatically from inner text values, locking to a narrow structural floor width boundary of 23px.
- **Badge vs. Eyebrow Decision Tree**: If a category status callout is shared identically across all items in a layout cluster array, output the data inside a standard eyebrow typography tag rather than standard badges. You are permitted to execute a solid neutral badge overlay template onto media asset views ONLY to protect text legibility when image texture choices challenge typography contrast thresholds.

### 5.3 Breadcrumbs
- **Component Anatomy**: Formed using nested default anchor link lists, a single final bold text selected item (current page status text), and forward-slashed string element dividers (`/`).
- **Layout Spacing Gaps**: Left-align breadcrumbs with the brand identity logo structure. Isolate padding values such that spaces extending from topmost navbar shells map exactly to parent document margin tokens. Gaps leading downward into secondary text notification headers or visual layout page hero items must mimic these grid specifications precisely. Include breadcrumb code inside full-bleed hero container rows when layout blocks color match.
- **Structural Depth Fence**: Block breadcrumb generation on single-tier layout hierarchies; do not generate breadcrumbs as comprehensive substitutes for core navbar layouts.
- **Active Path Truncation Policy**: Suppress the active final text selected path node segment from rendering if:
  1. The path title value exactly matches text strings inside the main page hero h1 headline container.
  2. The string value represents long variant data (such as extensive smartphone model designations on e-commerce PDP frames) and would cause word-wrapping, forcing downstream critical text lower.
- **Wrapping Break Mechanics**: Double-line text wrapping changes must trigger text breaks immediately *after a path separator indicator element*. Multi-line layouts execute a tight vertical margin gap configuration of exactly 4px layout spacing between typography rows. Contain total parameters to prevent text flows from breaking past a strict two-line threshold ceiling.

### 5.4 Button Groups & Primary CTA Blocks
- **Component Anatomy**: Manages structural layout matrices for combinations of interactive button shapes, standard default typography links, and text links containing chevron carets.
- **Pairing and Prominence Policy**: Allow a maximum value of **one primary block button** inside a given grid view context or action segment cluster. Match twin secondary styles if actions assume parallel rank weights. Supplementary links or carets carry low visibility parameters and must pair beside primary items. Large actions must only pair with matching large configurations, and small instances with small options.
- **Spatial Alignment & Scanning Logic**: Center-align button components by default across standard marketing contexts. Align button groups leftward below structured layouts to mirror natural left-justified human F-pattern reading trends on dense text screens, ensuring primary goals are processed first.
- **Sticky Layout Boundaries**: For massive informational screens, lock persistent actions into a clean bottom action container pane. The sticky panel container skin must match the background of the main canvas surface perfectly and feature a fine secondary line running along its top border. All primary background text content passes directly behind this segment layer.
- **Sizing & Unified Width Optimization**:
  - `Horizontal/Vertical Small Button Elements`: Sizing constraints evaluate fluidly from inner text length parameters + component side padding definitions.
  - `Horizontal/Vertical Large Button Elements`: When multiple button components are placed directly adjacent as sibling options in a group, parse character string lengths across both targets. Programmatically force the shorter block component width value to mirror and lock onto the identical pixel width of the longer text instance, creating matching, symmetrical boundaries. Symmetrical wide button pairings require an absolute floor component size width of 76px minimum.
- **Spacing Math Rules Matrix**:
  - Horizontal Row spacing configurations: Use `12px` separating adjacent button structures; use `16px` from a button frame edge to a standard text link; use `16px` between concurrent link instances.
  - Vertical Column spacing configurations: Use `12px` separating stacked button shapes; use `24px` separating buttons from text links; use `32px` separating sequential text link references.
- **Execution States Safeguard**: Do not disable form action submission markers when expected data values are absent from target inputs. Keep buttons active, programmatically intercepting incomplete requests via immediate form validation text tags or component summary banners. Hard component parameter locks are reserved only to show complete zero change states across existing databases.
- **Icon Integration**: Buttons may optionally include a single leading icon placed immediately before the text label to reinforce the action's meaning (e.g., a pencil icon before "Edit", a trash icon before "Delete"). Icons must be inline system icons only—no decorative graphics, illustrations, or brand logos. Limit to **one icon per button**, always positioned to the left of the label text with a consistent `mr-2` (8px) gap.

### 5.5 Tables
- **Anatomy**: Composed of a separate external Table Title, Header Row, optional Header Bottom Line, Table Header Cells, Rows, optional Row Bottom Lines, and Cells.
- **Functional Boundary**: Tables are optimized exclusively for managing and organizing complex datasets or highly dense tabular feature sets. Do not utilize standard text lists or stacked text layouts to outline sequential dataset matrix entries; map them structurally inside full grid cell rows instead.
- **Cell Elements Rigidity**: Cells may contain text strings, absolute numerical integers, standalone formatting data keys, localized text link prompts, or descriptive system icons. Content values must match a shared explicit formatting paradigm across a matching column array (e.g., if rendering numerical values, lock them completely to integers or consistent decimal counts uniformly). Never inject units of measurement or structural indicators inside cell text elements—move them strictly to column headers.

### 5.6 Tabs
- **Anatomy**: Formed as an integrated organizational nav row segment consisting of a minimum of two individual Tab items, text labels, and optional baseline Border Lines.
- **Operational Gaps & Singularity Suppression**: Tabs separate related content fields that do not rely on side-by-side metric comparison. If system permissions or logic restrict a group down to a single available choice, suppress and hide the tab header block entirely from client view. Automatically hide elements if content strings map to empty definitions.
- **Structural Alignment Systems**:
  - `Horizontal Row Setup (Default Mode)`: Enforce horizontally stacked tab rows natively across breakpoints.
  - `Vertical Column Setup`: Permitted entirely over tablet windows or large desktop frames only when total option loops exceed horizontal layout tracking capabilities. Mobile viewports fall back cleanly to a horizontal arrangement automatically.
- **Structural Equity Rule**: Intersecting layouts within tab frames must ensure strict architectural, programmatic, and typographic formatting consistency. Never duplicate content states or text variables across multiple options panels within an active component group.

### 5.7 Carousels & Tilelet Carousels
- **Anatomy**: Constructed out of uniform Carousel Slots, dynamic navigation pagination indicators, a Carousel Scrollbar status slider track, and partial edge visibility peeks.
- **Core Operations Logic**: Organizes related, supplementary content choices into a clean horizontal container track. Tracks are intentionally non-loopable, establishing explicit start point boundaries, middle navigation sectors, and end lines to reflect linear structural bounds. Supports user scrolling updates natively across viewports via pagination clicks, horizontal hardware mouse movements, touch-screen gestures, trackpad swipes, or keyboard commands.
- **Card Peek Layout Scales**:
  - *Standard Default Peek Mode*: Enforces a visible element width pattern measuring exactly one grid column + gutter width margin space. Enforce across desktop views, tablet views, and 1UP mobile layout frames.
  - *Minimum Peek Mode (Mobile Viewports Only)*: Constrains visible overlapping card edge variables to exactly 24px wide running from row padding lines.
  - *Zero Peek Mode*: Completely conceals neighboring choices. Use strictly when carousel containers do not consume the total horizontal width boundaries of page layouts. Zero peek mode mandates that pagination navigation controls remain permanently visible.
- **Sizing Symmetry Requirements**: All nested item cards within an active row container must operate with perfectly uniform width and height layouts. If items utilize variable content-driven dimensions, the taller element defines the layout frame height metric for the overall carousel track. Aspect-ratio items inside a singular track are structurally bound to a single identical layout scale ratio variable.
- **Mobile Density Breakdown Variations**: Supports customized 1UP (Default mobile scale layout model), 2UP, and 3UP horizontal display configurations.
- **Large Viewport Density Breakdown Variations**: Tablet viewports default to an active 3UP horizontal layout row configuration. Desktop layouts support large 4UP, 6UP, and sparse 8UP card matrices based on string content restrictions.
- **Gutter Tracking Separation Math**: Large desktop interfaces and tablet containers maintain a consistent grid space of exactly 24px layout space between items. Mobile breakpoints compress horizontal item-to-item spacing to exactly 12px layout space.
- **Hover Optimization & Permanence Boundaries**: Navigation pagination arrow tools utilize an unclipped 44px hit-area centered on arrow tracks. Desktop viewports materialize pagination arrows on row hover entries by default. Mobile paths hide arrows by default if standard card peeks are active. Pagination controls must stay permanently visible on screen if layout constraints remove peeks entirely.
- **Pagination & Scrollbar Single-Set Suppression**: If item collection quantities are low and completely fit within a single set viewport view tracking layout frame, **you must completely suppress, strip, and hide pagination markers and scrollbar elements from rendering**, aligning the tiles flat to standard grid columns.
- **Operational Availability Logic**: Suppress component instances cleanly from view instead of disabling elements if workflows are fundamentally closed to users based on layout parameters (such as reaching terminal carousel frames, chat system offline hours, or when users already sit at layout headers).

### 5.8 Text Areas
- **Anatomy**: Built out using a text box field container, floating Label element, optional dynamic Optional Indicator string, inner user Input Text row, dynamic Error Icon parameter, localized Error Text strings, and a character counter row overlay (`[current_count]/[max_limit]`).
- **Structural Boundaries Selection**: This input module is strictly reserved to process long-form user explanations or continuous content fields stretching beyond a simple singular line length parameter (e.g., collecting long user feedback notes). Short data criteria (names, keys, card codes) map to native Input Fields.
- **Character Count Threshold Locks**: Code implementations must integrate an active character tracker calculation dynamically. If field boundaries surpass active parameters, throw validation alerts immediately, locking layout views until values clear boundary fences.

### 5.9 Text Link Carets & Secondary Links
- **Component Anatomy (Text Link Carets)**: Formed as an interactive text item containing an implicit right-facing forward caret symbol asset (`>`) or left-facing backward caret asset (`<`).
- **Prominence Framework Applications**: Serves higher structural prominence metrics than a standard underlined Text Link, but holds less raw layout prominence than a solid Button. Apply exclusively to forward navigation loops or to execute primary feature shortcuts.
- **Component Anatomy (Text Links)**: Formed as an interactive typography line element featuring an active lower border underline rule.
- **Structural Fills Variations**:
  - `Standalone Variation (Default Style)`: Render independently to handle low-emphasis structural jumps or secondary task undo actions (e.g., `Cancel`). Sizing scales to large or small steps inside form setups.
  - `Inline Variation`: Embedded directly within paragraph text prose blocks to handle auxiliary reference paths. Inline metrics (size, font weight, color mapping definitions) inherit styling natively from parent text block setups.
- **Caret Axis Orientation Parameters**:
  - `Right Placement (Default state)`: Append the caret symbol to the right of text strings when executing standard next steps, product advances, or forward flow transitions.
  - `Left Placement`: Prepend the caret symbol to the left of text strings strictly when executing logical reverse transitions or back-step triggers (e.g., hardcoding `< Back` strings cleanly).
- **Writing POV Integration Constraints**: Drop spatial interaction keywords completely from text paths. Phrasing properties align sentence targets cleanly from the direct point-of-view of the active client consumer, anchoring pronouns into first-person metrics (**me / my / mine**).

### 5.10 Date Pickers
- **Component Anatomy**: Assembled from a Form Label, Calendar Icon input trigger, optional internal Input Text, dynamic dropdown Calendar block, optional descriptive Helper Text, optional interactive Tooltip trigger, dynamic context Error Icon, and localized Error Text row.
- **Task Timeline Boundaries**: Component configuration maps strictly to handle input requests restricted to a tight 12-month horizon timeline calculation running both forward or in reverse from the current system calendar entry. For data captures targeting milestones outside this 12-month threshold parameter (such as user Date of Birth registration flows), block this template selection entirely and transition to standard static Input Field formatting blocks.
- **Dimension & Paired Alignment Boundaries**: Default width parameters are fluidly scalable, spanning 100% of the active parent area container. You are permitted to execute a 50% split width horizontal pairing model ONLY if fields establish an immediate, logical context match (such as pairing twin continuous Start Date and End Date calendar prompts side-by-side in a layout view). Incorporate a strict absolute code tracking size calculation floor metric of 186px minimum width to safeguard textual data boundaries from clipping out across responsive rendering rows.
- **Gaps & Vertical Row Mechanics**: Separate stacked vertical picker fields using a constant margin gap specification of exactly 24px space separating the base border line of the top field from the highest typography bounding box row of the bottom field label. Validation error messages step-insert cleanly beneath parent boundaries, smoothly pushing all downstream document content lower on the page canvas. Optional helper instructions sit exactly 8px beneath the terminal text layout element. Row layouts grouped into horizontal side-by-side splits space apart by an exact 12px grid gutter track.
- **Runtime Mount Behaviors**: Interactive click events occurring anywhere inside the target boundary prompt the system to render the parent calendar drop module. Code frameworks must lock the target calendar focus row directly onto the current system calendar date on initial component mounting states. The dropdown element automatically collapses into hidden states immediately upon a single selection task cycle execution or if a user interaction falls anywhere outside the drawing zone. Default rendering configurations project the active month layout directly *beneath* target inputs; programmatically invert this behavior to fire upward instead if window screen parameters reveal collision bottlenecks with base viewport borders.

### 5.11 Dropdown Selects
- **Component Anatomy**: Built out using a Form Box Container frame, standard descriptive text Label, right-justified Caret Icon trigger, optional Optional Indicator string, inner Selected Option Text, optional descriptive Helper Text, optional contextual Tooltip block, dynamic Error Icon parameter, localized Error Text strings, and interactive nested structural Option Lists.
- **Variations (Style Layout Fills)**:
  - `Default Framework Mode`: Render by default inside large multi-step transactional page forms (such as entry rows inside shipping address lookup matrices).
  - `Inline Action Label Mode`: Render exclusively when dropdown triggers dictate global content sorting operations across separate canvas areas (such as sorting filter options paths on product grid walls). Inline models require an immutable default selector value pre-assigned upon initialization.
- **Task Selection Thresholds**: Apply dropdown menus exclusively to handle data sets where target list items scale to **10 or more options parameters** to clean up vertical canvas scannability metrics. For low-volume parameter questions (less than 10 total target items), suppress dropdown setups completely, rendering alternative native choices like single-select Radio Button arrays or customized Radio Box shapes instead.
- **Layout Sizing Multipliers**: Component options map cleanly to exact 50% or 100% layout width steps inside parent forms. Default framework boxes establish a narrow physical size calculation floor metric of 66px width thresholds; inline variation models expand this absolute tracking metric to 102px minimum width boundaries. Ensure option list character tracking dimensions scale safely to guard typography from truncation boundaries across active viewports.
- **UI Element Cleansing Guidelines**: Completely **ban the injection of temporary placeholder strings** inside standard dropdown fields when selections are empty. Keep fields completely blank to reduce line noise and match clean visual tracking benchmarks. Options inside list arrays must automatically map to native user-agent browser system configurations across matching target platforms.

### 5.12 Footnotes
- **Component Anatomy**: Compiles supporting definitions, annotations, and compliance strings inside an item cluster containing a Footnote Item index wrapper, matching anchoring index Symbol parameter, and raw information text fields.
- **Variations (Visibility Metrics & Dimensions)**: Default templates process using secondary gray element colors. Move fields into primary element contrast weights only when required to emphasize warning text parameters or when mandated by corporate legal guidelines. Component typography defaults to `Micro typography parameters` globally across all display viewports.
- **Index Symbol Selection Trees**: Decouple index formatting styles dynamically by parsing total footnote quantities matching an active section workspace:
  - *Quantities = 1*: If the single element sits immediately adjacent to the text path it details, completely suppress symbol flags from rendering.
  - *Quantities = 1 or 2*: Output sequential asterisk indicators using standard typography loops (`*` for index 1, `**` for index 2). Suffix indicators cannot exceed a maximum capacity block of 2 asterisks.
  - *Quantities >= 3*: Automatically transition all symbols into uniform alphanumeric string values (letters or numbers) ordered sequentially. Never combine asterisk configurations with sequential alphanumeric strings within a single layout group block.
- **Placement & Layout Logic**: Position lengthy, generalized annotations cleanly at the true page footer layer to ensure legal parameters do not disrupt main visual reading grids. Group highly specific entries inline directly underneath the matching content area they clarify. If an interaction button path introduces hidden system obligations that are obscure to users (such as an active purchase checkout button double-serving as consensus confirmation for long-term contract structures), **force the descriptive footnote segment to mount directly above the primary execution button container**.
- **Internal Sizing Spacing Gaps**: The layout envelope tracking the symbol indicators scales automatically to match the width metrics of the widest segment variable inside an active index array. Maintain an immutable horizontal padding spacer of exactly 4px layout spacing between the outer frame edge of the symbol column and the text column baseline. Large content blocks must be split cleanly across individual entries; do not stack lengthy legal text items into a lone footnote item block.

### 5.13 Icon Lists
- **Component Anatomy**: Sequenced display layout breaking down associated contextual notes into parallel text lines, mapping each distinct point to a clear indicator graphic framework. Dedicated exclusively to highlight visual perks, corporate plan benefits, or marketing incentives cleanly.
- **Gutter Row Spacing Scales**: Match formatting steps to these exact multipliers:
  - *Standard Mode Gutter*: Employs `4X` (16px) layout space separating consecutive row elements.
  - *Compact Mode Gutter (Tile Views)*: Employs `2X` (8px) layout space separating consecutive row elements.
  - *Comfortable Mode Gutter (Long-form views)*: Employs `6X` (24px) layout space separating consecutive row elements.
- **Icon-to-Typography Spacing Metrics**: Standard templates employ a `2X` (8px) gap between indicators and text blocks. Compact grids drop this configuration parameter to a `1X` (4px) multiplier gap. Comfortable setups utilize a wide `3X` (12px) horizontal parameter.
- **Vertical Alignment Standards**: Center indicator graphics perfectly along a shared middle axis matching short description fields in standard components. Shift properties to align cleanly to the topmost baseline row ONLY if description copies text-wrap down into multi-line configurations across active breakpoints.
- **Typography Sizing Pairs**: Programmatically unify layout dimensions such that text definitions and symbol parameters map according to strict corporate guidelines:
  - *Micro rows layout*: Item title scales to `Micro parameters` matched to Large icon configurations. Subtitles default to matching Micro structures.
  - *Small rows layout (Default)*: Item title scales to `Body Small variables` matched to configurable icon targets.
  - *Medium rows layout*: Item title scales to `Body Medium variables`.
  - *Large rows layout*: Item title scales to `Body Large variables`.
  - *XLarge rows layout*: Item title scales to `Title Small variables`. Mobile viewports utilize Large icon graphics; desktop frameworks switch to utilize XLarge icon paths.

### 5.14 Input Fields
- **Component Anatomy**: Interactive input component composed of a wrapper Box Container, core floating description Label, optional Optional Indicator mark, editable inner Input Text row, masked layout hidden tracks (Password only), standard Credit Card Brand graphic assets, contextual Error Icon markers, Inline Action links, descriptive Helper Text segments, auto-formatted Typeover Text indicators, localized Tooltip anchors, crisp Error Text descriptions, verification Success Icon marks, and success validation message text blocks.
- **Functional Variations Matrix**: Configure custom masking hooks, input properties, and auto-formatting parameters strictly around content design types:
  - *Standard Text (Default Framework)*: Free-form layout tracking variable textual input fields (such as capturing alpha user names or full corporate addresses).
  - *Password Data Entry*: Automatically obfuscates data via solid security mask dots by default. User toggle links (e.g., `Show` / `Hide`) are blocked from generation until backend implementations obtain documented clearance from internal corporate security governance groups.
  - *Calendar Date Entry*: Numbers-only input restricting entries via predictive auto-formatting script rules and layout character text masking helps.
  - *Phone Number Entry*: Numbers-only input prompting a custom smartphone layout numeric key layout upon client entry focus.
  - *Credit Card Brand Track*: Evaluates numeric entries in real-time, executing pattern matches to declare card properties visually (such as rendering Visa/Mastercard asset tags inside input boxes automatically).
  - *Security Verification Code*: Numbers-only module tracking card properties to shift help states dynamically (such as generating back-of-card 3-digit diagrams for Visa, or front-of-card 4-digit diagrams for American Express).
  - *Asynchronous Inline Actions*: Processes single input verification parameters asynchronously inside layout blocks via an immediate button anchor text style link (such as coupon code validations inside shopping summary grids).
- **Form Layout Scaling Ceilings**: Components scale fluidly across 50% or 100% of parent web layout rows. Align twin 50% components side-by-side strictly when parameters demonstrate an unassailable data pairing relationship (such as grouping sequential First Name and Last Name fields, or structural City and State modules). Large form items adhere to absolute horizontal minimum size constraints to stay cross-device safe:
  - *Standard Default Fields floor width limit*: 40px.
  - *Password Form Fields floor width limit*: 62px.
  - *Security Verification Fields floor width limit*: 88px.
  - *Inline Actions Fields floor width limit*: 102px.
  - *Calendar Date Fields floor width limit*: 114px.
  - *Phone Number Fields floor width limit*: 176px.
  - *Credit Card Fields floor width limit*: 288px.
- **E-Commerce Checkout Sequenced Fields Formats**: When writing fields arrays for standard e-commerce transaction payment cards, execute the layout exactly matching the processing structure of physical credit cards: Card Number must mount first, followed directly by Expiration Date, Cardholder Name, Security Code, and final Card ZIP Code.
- **Validation Timing Guard**: Do not run data validation logic scripts or throw active red error warnings while users are in the middle of text input activities. Validation triggers must delay operations until focus leaves the target box or users attempt full form submission.
- **Placeholder Text Prohibition Safeguard**: **It is strictly prohibited to insert standard placeholder gray sample text strings inside blank input fields**. Placeholder contents are often misinterpreted by end-users as automated pre-population, leading to broken submission loops and system error bottlenecks.

### 5.15 Input Steppers
- **Component Anatomy**: Label (optional), Optional Indicator (optional), Tooltip (optional), Control envelope, Decrement Button, central Value string, optional Trailing Text, Increment Button, optional Helper Text, and optional Error Text.
- **Core Operations Logic**: An interactive layout control that handles manual decrement and increment shifts for discrete numeric constraints (such as checking multi-line smartphone lines additions or inventory checkout quantity balances). Stepper structures execute tracking operations exclusively via active hardware click events on the explicit `+` and `-` boundary parameters; raw alphanumeric typeover inputs inside values slots are strictly locked and **not supported**.
- **Ranges and Defaults Boundary Logic**: System constraints lock minimum index values to exactly 0. System constraints establish maximum parameter caps to exactly 99 total metrics. Upon layout initiation, fill values slots automatically with a calculated smart operational default calculation that matches general user trends to reduce form drop exceptions. Banned application models: Do not configure input steppers if targets specify massive numerical ranges or custom data sets where value variations calculate over vast non-linear stretches (completely ban inputs formatting parameters like user age records).
- **Sizing Scale Variations**:
  - `Large (Default style)`: Intended for primary transaction frameworks; must consistently map sizing configurations to equal-rank primary fields or large components (e.g., standard button shapes). Requires an absolute control element size width floor limit of 121px.
  - `Small style`: Used when physical workspace bounds are critically constrained (such as product overview tile lists or micro item containers). Requires an absolute control element size width floor limit of 90px.
- **Sizing Mechanics & Width Allocations**:
  - `Auto width style (Default mode)`: Enforces a tight fluid border constraint that shrinks the control width footprint around the value text segment, padding slots, and trailing variables dynamically.
  - `Fixed width value`: Establish pixel parameters manually strictly when layouts map adjacent targets to shared grid line indices, when trailing label modifications risk element layout shifting upon user selection triggers, or when localized helper labels extend horizontally to the right of selectors. Ensure option list text strings fit correctly to ensure no ellipses crop figures.
- **Error Validation Tracking**: Check validation exceptions strictly upon parent form submission requests; do not show real-time validation flags during standard click changes. Trigger text error blocks instantly underneath component tracks if users ignore required selection lines or if parameters exceed maximum local inventory warehouses stock ceilings.

### 5.16 Lines / Rules
- **Core Function**: Visually splits canvas sections, column arrays, or row components to provide unmistakable operational hierarchy layout anchors across layout screens.
- **Line State Classifications**:
  - `Primary (Default state)`: Heavy operational separation marks dividing key grid contexts, visual layout blocks, or separating parent headers from child components. Limit architecture properties to a strict absolute maximum parameter of **only one primary line item per independent section block**. Structural restrictions fence primary borders completely: **Never** display a primary rule line as the topmost first or terminal final row asset on any document area.
  - `Secondary state`: Fine demarcation rules mapped to decouple individual entries in uniform tables, repeating list cells, or to underline active navigation bar components safely. Always group a secondary border onto the lower horizontal edge axis of fixed-position modules (such as navigation controls or toolbar strips) to construct clean separation from scrolling fields passing beneath it.
- **Visual Cleansing Guard**: Prioritize pure mathematical empty white space over standard divider rules everywhere whenever layouts allow it to reduce screen busy metrics and avoid messy visual noise blocks. Completely **ban the placement of divider rules** separating main page hero title segments from nested body content lines.

### 5.17 Unordered Lists
- **Core Function**: Organizes related info components into broken-out consecutive bullet loops when text elements skip formal chronological sequences or exact numeric arrays.
- **Sizing Steps**: `Body Large` (Default state for core views), `Body Medium`, `Body Small`. Disclosures, legal blocks, and footer conditions use `Micro variables` exclusively.
- **Layout Math Multipliers**: Use standard padding spaces for typical page body lists. Restrict layouts to tight compact space scales metrics strictly inside bounded grid tiles or UI cards.
- **Structural Quantity Limits**: **Completely ban the rendering of bulleted layouts containing less than 3 item elements**. Small data definitions (1 or 2 items total) must be compiled natively into standard regular sentence prose structures to preserve layout clean benchmarks. (Exception: Minimal bullet arrays are permitted only to match uniform structural symmetry across adjacent multi-column lists). Never bunch list data points into a single massive paragraph block wrap.
- **Syntax Consistency Trees**: Items must remain highly concise, aiming to restrict copy to a single row max per bullet. Stacking list groups mandates absolute grammatical uniformity across all node segments (e.g., all rows initialization markers start with a Noun, or all start with a Present-Tense Verb; all nodes append matching end punctuation, or all nodes completely drop it).
- **Identical Initial Phrase Suppressing**: Completely intercept and filter out repeating keyword strings from accumulating at the initialization bounds of consecutive loop paths to ensure text blocks remain easily scannable.

### 5.18 List Groups
- **Anatomy**: Flexible interactive list item container containing optional Top Line, List Group Item Title text, optional description Subtitle text, optional Subtitle Right text, optional Descriptive Icon or Image, optional Action Element, and optional Bottom Line.
- **Action Elements Controls Matrix**: Allow a strict absolute maximum capacity of **only one action element utility per row item** across all layout views:
  - `Action Icon (Default state)`: Standard chevron selector paths (`→`) showing click capability natively. Suppress indicator icons cleanly if destination layouts are completely self-evident from context (such as generic item listings).
  - `Checkbox Selector Mode`: Integrated to group options within binary or multi-select form architectures.
  - `Text Link Mode`: Render standard interactive link typography actions (e.g., explicit options markers like `Edit`) if navigation destinations require hyper-specific label visibility.
  - `Toggle Switch Mode`: Integrate row-by-row switch toggles to capture immediate preference updates.
- **Responsive Width Adjustments**: Fluid layouts expand to fill 100% of the active parent area across mobile boundaries. Scale fields into clean multi-column rows splits (e.g., standard 50% split properties) on tablet screens or large desktop grids. Column indexing maps systematically top-to-bottom, followed left-to-right.
- **Line Visibility & Border Rules Sync**: Keep rule properties perfectly identical when formatting across alternate breakpoints. Drop top component dividers cleanly if list models render directly underneath tab navigation bars that already feature a bottom base line. Hide bottom borders if lists terminate an element container or sit at page folds. If multi-column list setups track uneven row metrics across grids, suppress the bottom border on the lowest index item exclusively to maintain grid system equity.
- **Media Thumbnails Rules**: Graphical icon indicators or standard static preview images can be included to elevate scanning properties. Keep visual configurations exclusive: **Only allow one single asset category** (either pure icons or flat static images) inside a continuous collection. Every item row in a series must display a visual preview element or all components must drop it uniformly; do not mix random unaligned fields arrays.
- **Typography Sizing Weights Hierarchy**: Apply standard regular/light text styling variables to list titles by default. Manual upgrades to custom bold text options are permitted ONLY to rescue readability if headers host high loads of custom meta numbers or if bold attributes help structure text hierarchy inside layered tiered child lists. Sibling items inside a unified row array must adhere to perfect text weight uniformity.

### 5.19 Loaders
- **Component Anatomy**: Engineered utilizing an implicit background viewport masking tint overlay layer and a central, looping vector motion active loader animation emblem.
- **Operational Availability Triggers**: Trigger active loader animations uniformly across workflows anytime an active system calculation process, asynchronous data lookup loop, or form submission cycle creates an expected wait delay of more than 2 seconds (`wait_time >= 2s`). Loaders automatically drop from view instantly upon backend process resolution.
- **Placement Logic Coordinates**:
  - `Full Page Canvas Overlay Mode`: Render full screen background blocks when user actions map to critical irreversible workflows, when selecting custom form data filters alters the visibility metrics of the entire page concurrently, or when global page files are mounting and need to be locked from parallel user clicks.
  - `Component-Specific / Module Level Overlay Mode`: Restrict animation boundaries carefully inside a single container row or card box if tasks only process a subset section of a page, keeping sibling elements clear for continuing user browsing interactions. Leverage component level overlays by default if parent paths supply clear user-initiated cancel options.

### 5.20 Skeleton Loaders
- **Component Anatomy**: Constructed using lightweight placeholder layout frames that mirror the structural shape, sizing, and spatial arrangement of the real content they represent. Individual placeholder blocks render as solid neutral gray fill rectangles (`bg-gray-200` for primary shapes, `bg-gray-100` for secondary shapes) with a continuous CSS pulse animation (`animate-pulse`) to communicate active loading state.
- **Preferred Loading Strategy**: Skeleton loaders are the **default loading pattern** for any content panel, queue view, dashboard, or data-driven layout. Reserve full-page overlay spinner modals (Section 5.19) strictly for critical irreversible workflows (form submissions, destructive actions, authentication). For all standard data-fetching operations (loading queues, refreshing lists, mounting tab content), render inline skeleton frames directly inside the target container instead of blocking the viewport with a modal overlay.
- **Structural Fidelity Requirements**: Skeleton placeholders must accurately replicate the spatial architecture of the destination content layout. If the real view renders a three-panel layout (sidebar, content, detail), the skeleton must render three matching panel divisions with proportional widths. If the real view contains a header bar with icon badges, count strips, and filter toggles, the skeleton header must contain corresponding placeholder blocks at matching positions and approximate dimensions.
- **Placeholder Shape Mapping Rules**:
  - `Text lines`: Render as low-height rounded rectangles (`h-3` or `h-4`, `rounded`) at varying widths (`w-1/2`, `w-3/4`, `w-full`) to simulate natural text length variation.
  - `Icon or badge placeholders`: Render as small squares or circles matching the expected icon dimensions (`w-6 h-6 rounded-lg` for square icons, `rounded-full` for circular badges).
  - `Card containers`: Render as rounded rectangles matching the target card's border-radius token (`rounded-xl` for tiles, `rounded-lg` for nested items) with matching border and shadow properties (`border border-gray-200 shadow-sm`).
  - `Button placeholders`: Render as small rounded rectangles at approximate button dimensions (`w-24 h-7 rounded`).
  - `Count strip or filter bar placeholders`: Render as a row of uniform rounded rectangles inside a container matching the real filter bar's background and border properties.
- **Color Tinting for Contextual Hints**: Skeleton placeholders may use subtle contextual color tints to hint at the content type they represent. For example, use `bg-red-100` for failure-related badge placeholders in error queues, or `bg-orange-50` for feedback comment skeletons. Tinting must remain extremely subtle (50–100 level Tailwind shades only) and must never use vivid or saturated fills.
- **Hierarchy & Depth Simulation**: Skeleton layouts must simulate content hierarchy through size variation and spatial grouping. Primary headings use taller, wider placeholder bars. Secondary text uses shorter, narrower bars. Group related placeholders inside container shapes that match the real card or section boundaries. Use vertical spacing (`space-y-2`, `space-y-3`) consistent with the real layout's gap tokens.
- **Panel-Specific Empty State Placeholders**: For multi-panel layouts where one panel serves as a detail/preview pane (e.g., "select an item to view details"), render a centered empty-state skeleton containing a large muted icon placeholder, a medium-width title bar, and a longer subtitle bar. This communicates that the panel is intentionally empty rather than broken.
- **Rendering & Replacement Lifecycle**: Skeleton HTML is injected directly into the target container element (`innerHTML`) immediately before initiating the asynchronous data fetch. Upon successful data resolution, the real content render function overwrites the container contents naturally, replacing the skeleton without requiring explicit cleanup. No `hideLoadingModal()` or manual skeleton removal calls are necessary.
- **Animation Consistency**: All skeleton placeholder elements within a single container must share a unified `animate-pulse` animation cycle by wrapping them inside a common parent element with the `animate-pulse` class. Avoid applying `animate-pulse` to individual leaf elements independently, as this creates distracting desynchronized flicker patterns across the layout.

---

## 6. Comprehensive Component Copywriting Metrics

### 6.1 Accordion Component Copy Rules
- **Header Primary Title**: Short text phrase executing sentence case attributes with zero tail punctuation markers. Text strings must accurately summarize hidden parent details. Sizing limits: maximum character count cap of 2 lines depth, 7 words, or 70 total characters.
- **Header Subtitle**: Optional context item rows. Sizing limits: max structural ceiling parameters of 7 words or 30 characters in sentence case.
- **Accordion Hidden Child Copy**: Must stay strictly relevant to the top title parameters. Structural capacity limit of 2 paragraphs maximum; individual text blocks are capped at 3 sentences or less.

### 6.2 Badge Component Copy Rules
- **Formatting Design Structure**: Write content exclusively inside sentence case structures, systematically stripping out all trailing punctuation blocks or character symbols (`!`, `,`, `.`).
- **Volumetric Limits**: Capped at a concise vocabulary density threshold of 1 to 2 words maximum per element. Words must declare states distinctly so the interface does not depend on color fields to parse data.

### 6.3 Breadcrumbs Component Copy Rules
- **Structural Casing**: Enforce sentence case on all link elements. Copy values map identically to corresponding paths inside navigation trees. For deeply isolated pages lacking nav tree properties, pull matching page titles exactly. Truncate extensive text names to guarantee path loops stay constrained within a two-line row visibility ceiling.
- **Company Branding Suppression Rule**: Strip out company identifier parameters ("Verizon") from general navigation steps unless an explicit proper legal trademark asset mandates text formatting (e.g., allow **"Verizon Visa Card"**, but filter "Verizon Home Internet" down to output cleanly as **"Home Internet"**).

### 6.4 Button Group & Primary Action Copy Rules
- **Vocabulary Case & String Caps**: Output labels using sentence case styling variables. Character values scale strictly within 2 to 15 characters max (`minLength: 2`, `maxLength: 15`).
- **Verbal Command Standard**: Initial action points inside main forms or checkout targets must initialize using an active operational verb.
  - *Banned Verb Exception*: Omit driving operational verbs on clusters of navigational list targets (such as search refinement choices grids; state properties directly, e.g., output static targets like **"Bedding"**, **"Blankets"**, or automated system responses like **"Done"**).
- **Sensory-Neutral Constraints Script**: Prioritize universal vocabulary metrics across user paths. Drop terminology that makes baseline assumptions about user physical sight or layout orientation parameters; process actions via sensory-neutral keywords (e.g., hardcode terms like **"Review"**, **"Go to"**, or **"Visit"**; never utilize expressions like "View" or "See").
- **Spatial Mechanics Prohibitions**: Completely ban touch-interaction phrases or orientation tracking words inside link tags (completely ban terms like **"Click here"**, **"Tap for more"**, or **"Swipe"**).
- **Perspective Alignments Guard**: Frame text strings from the explicit vantage point of the consumer, utilizing first-person personal pronouns (**me / my / mine**).
- **Temporal Keywords Elimination**: Strip the word "now" from actions unless user confirmation triggers a backend loop instantly without loading secondary informative UI blocks (e.g., utilize **"Register"**, but block words like "Buy now" if a component routes target users to standard product informational layouts).

### 6.5 Checkbox Copywriting Standards
- **Label Content Fields**: Optional text segment. Structure copy using a concise word or short phrase in sentence case without trailing commas or semicolons. Phrase targets using affirmative declarations; completely ban negative expressions (e.g., write **"I agree to the Terms"**, never generate expressions like "I don't agree to the Terms").
- **Supporting Description Rows**: Optional text row used to clarify user selections. Sentence case, no trailing punctuation. Ensure copy supplies genuine analytical context matching user targets without copying the primary label text strings.
- **Required Single-Item Fault Descriptors**: Missing required single items format error messages according to template layout boundaries: `Please [action that interacting with component represents] to continue.`. Enforce a maximum system character ceiling of 1 line or 25 total characters max.

### 6.6 Date Picker Component Copy Rules
- **Form Label Copy**: Briefly summarize targeted input parameters. Completely block active instructional verbs or command phrases (e.g., write flatly **"Date"**, never generate commands like "Select a date"). Max string values cap at 3 words or 15 characters max in sentence case. Do not include required format text inside the visible label element.
- **Default Input Values Formatting**: Display automated selections using default formatting string rules: `Mon D, YYYY` (e.g., `Jan 11, 2022`). System frameworks can fall back to alternative configurations `MM/DD/YYYY` or `MM/DD/YY` if explicit constraints require it.
- **Localized Error Feedback Templates**: Missing parameter validation loops utilize an explicit template structure: `You must enter a(n) [label]`. Generic unspecified system faults deploy: `Your entry isn't valid. Please try again.`. For specialized invalid parameter paths, name the fault point and output exact text rules to resolve boundaries cleanly (e.g., `Select a date in the future to continue.`). String values adhere to sentence case capped at 1 line or 30 characters maximum.

### 6.7 Dropdown Select Component Copy Rules
- **Form Label Copy**: Sentence case, maximum length constraint of 1 line or 34 characters total. Describe input requirements flatly without using verbal instructions.
- **Inline Action Label Strings**: Maximum tracking space of 8 characters max in sentence case formatting. Append an explicit colon separator directly behind text hooks (e.g., hardcode properties to output exactly as `Sort by:`).
- **Option Text Sets**: Capped at 1 line or 30 characters max in sentence case. Array content lists must execute using a structured, logical sequence framework (such as organizing fields alphabetically, numerically, or tracking historical analytics to sort items cleanly by global popularity scores).
- **Validation Error Text Templates**: Required unselected dropdown tracks output message syntax according to this exact structural template layout block: `Select a(n) [label].`. Strings are constrained within a maximum of 2 text lines or 45 total characters max inside sentence case.

### 6.7 Footnote Component Copy Rules
- **Text Layer Formatting Rules**: Process annotations in sentence case concluding with trailing sentence dots. System design constraints require the use of active voice phrasing models while proactively filtering out corporate abbreviations or complex inside acronyms. Sentences are written exclusively from the customer's structural viewpoint rather than backend mechanical loops.

### 6.8 Input Field Component Copy Rules
- **Visible Label Design Strings**: Brief descriptors bounded within a maximum length constraint of 3 words or 15 characters max. Sentence case is mandated everywhere except for specific appropriate legal proper nouns (e.g., write **"Social Security Number"** exactly). Completely filter out trailing commas, terminal semicolons, instruction hooks, or formatting help text strings from the label line layer.
- **Hardcoded Standard Inventory Strings**: For standard information requests across all project views, match the string properties exactly to this inventory to ensure repository alignment:
  - User Names: `First name` | `Last name`
  - Contact Values: `Email address` | `Phone number` | `Alternate phone number`
  - Address Assets: `Address` | `Apt/Ste/Flr` | `City` | `ZIP Code`
  - E-Commerce Assets: `Card holder name` | `Card number` | `Expiration date` | `Security code`
  - Account Variables: `Password` | `Date of birth` | `Offer code`
- **Hardcoded Instruction Helper Text Blocks**: Form components mapping standard address tasks must hardcode these explicit, literal text configurations inside sentence case complete with standard punctuation:
  - *Billing Address inputs (and corresponding billing ZIP code containers)*: Output exactly: `Where the account owner receives their bill.`
  - *Service Address inputs (and corresponding service ZIP code containers)*: Output exactly: `Where a line will primarily be used.`
- **Validation Error Text Layout Metrics**: Missing required criteria inputs must process using an automated tracking layout logic template: `Please enter a(n) [label].`. Generic entries missing structural explanation values display: `That entry isn't valid. Please try again.`. For errors with explicit resolution parameters, write descriptive tutorials targeting data fixes directly (e.g., prioritize instructional help strings like **"Your ZIP Code should be 5 digits"** over ambiguous text like "Enter a valid ZIP Code"). String parameters map to sentence case capped at 1 line or 30 characters maximum.
- **Success Text Confirmations Layout Metrics**: Real-time validation confirmations execute sentence case text streams tracking exactly what has been successfully processed. Copy structures must utilize highly conservative, objective language terms; completely ban high-excitement exclamation points, caps-lock keywords, or enthusiastic words from success tag outputs. Limits: locked to a maximum space ceiling of 1 line or 30 characters total.

### 6.9 Input Stepper Copywriting Standards
- **Visible Label Content Fields**: Concise title string declaring the exact programmatic object variable the customer is adjusting (e.g., `Lines`). Completely **ban the insertion of verbal operational commands or active configuration phrases** (completely exclude text patterns like "Select number of lines"). Maximum count boundaries: strictly capped at a target ceiling of 3 words or 15 characters total in sentence case form.
- **Value Trailing Text Copy**: Keep string elements exceptionally concise. Length filters vary based on viewport breakpoints; ensure labels do not trigger unexpected ellipsis clipping patterns. Completely drop trailing values text from layout strings if a clear, custom header label introduces the stepper control explicitly.
- **Error Feedback Template Handling**: Form validation faults formatting error text definitions must comply strictly with these preset structural templates based on system triggers:
  - Missing field entries exception: `Please choose a number of [labels].`.
  - Warehouse stock limit exception: `Item is low in stock. Try decreasing quantity.`.
  - Text properties track strict sentence case criteria constrained to a maximum volume ceiling of 1 line or 30 characters total.

### 6.10 Tables copywriting Standards
- **Table Titles**: Written strictly using an active, useful voice phrasing model (e.g., generate **"Your minutes this month"**; never utilize passive prose variants like "Here's a look at this month's minutes"). Character limit constraints are bounded between 3 to 5 words max inside sentence case.
- **Column Header Cell Labels**: Concise descriptor strings specifying the category criteria of hidden row parameters (e.g., `Date`, `Time`). Must initialize using strict Nouns; completely ban action tasks or sequential numbers tags from header lines. Max length boundaries: restricted to a line spacing ceiling of 2 words or 12 characters max.
- **Data Content Cells Text**: Succinct alphanumeric data blocks capped at a max threshold of 25 characters total.

### 6.11 Tabs copywriting Standards
- **Tab Header Labels**: Descriptive noun identifiers that classify underlying view content accurately (e.g., `Accessories`, `Plans`, `Upgrades`). Completely **ban abstract or generic layout labels** from rendering fields (completely drop placeholders like "General" or "Recommended"). Length criteria limits: constrained inside a narrow maximum parameter cap of 2 words or 10 characters total in clear sentence case formatting.

### 6.12 Text Areas Copywriting Standards
- **Form Component Label copy**: Crisp noun fields declaring what long-form description values are being gathered. Instructional commands or workflow guides are strictly banned from header string spaces (e.g., write **"Feedback"** cleanly; never select phrasing variables like "Add feedback"). Text rules require sentence case with absolute omission of final periods or commas. Max parameter ceiling: 3 words or 15 characters max.
- **Validation Fault Text Templates**: Empty values blocks matching mandatory parameters deploy syntax exactly matching this layout template block: `Please provide (a/an) [label].`. Exceeded length boundaries throw a standardized warning: `Stay within the character limit.`. Text case resolves inside sentence case capped at 1 line or 30 total characters max.
- **Helper Description copy text**: Optional subtext row sitting exactly beneath form components. Copy guidelines dictate a concise, single-sentence operational clarification loop completed by true punctuation marks.

### 6.13 Text Link Caret & Secondary Link copywriting Standards
- **Target Typography Labels string**: Action phrases align sentence case definitions cleanly to the exact header title matching down-funnel arrival pages (e.g., if linking to an active layout row featuring an H1 tag for "Billing FAQs", the selector copy must initialize to match: `Visit billing FAQs >`).
- **Punctuation filtering limits**: Component string paths must completely filter out trailing periods, semicolons, or sentence dots from the text layer.
- **Banned Action Variables**: Completely ban touch-interaction phrases or touchscreen motion directional actions within link typography structures (completely ban terms like **"Click here"**, **"Tap for more"**, or **"Swipe"**).
- **Word Constraints Ceilings**: Standalone and caret menu actions are highly brief, keeping character values bounded within these cross-viewport criteria tracks:
  - *Standard Text Links configurations parameters*: Capped within 1 to 3 words total or 4 to 15 characters max.
  - *Text Link Caret configurations parameters*: Capped within 1 to 5 words total or 4 to 15 characters max (4 characters represents the programmatic floor minimum to pass accessibility target criteria sets).

### 6.14 List Group Copywriting Standards
- **Header Primary Title**: Short text phrase executing sentence case attributes. Omit trailing punctuation lines unless formatting a distinct troubleshooting query. Sizing limit constraints: restricted to a line tracking ceiling of 2 lines or 50-60 characters maximum. Items arranged inside a sequential collection block must hold a matching grammatical voice layout profile.
- **Description Subtitle Text**: Optional informational string used exclusively to present customized metadata fields or clear contextual variables. Banned configuration style: do not repeat text loops that are already outlined inside the primary title block container. Characters limit constraints: 80 total characters max in standard sentence case.
- **Subtitle Right Copy**: Optional label metric reserved strictly to pass compact text details (such as price summaries or short status parameters). Keep strings limited to 1 to 2 words max to safeguard columns formatting layout uniform metrics across devices.

---

## 7. Global Application Component Word-Token Substitutions Matrix
When setting markup properties or programming UI views, process intent strings dynamically to match these exact standard values across all system platforms:

| Target Component Interaction Flow | Forbidden Phrasing String | Mandatory Standard String | Source Design System Package |
| :--- | :--- | :--- | :--- |
| User Online Account Registration Flow | `"Sign up"` | **`"Register"`** | Checkbox / Button Base Rules |
| Primary E-Commerce Shopping Cart Access Link | `"View cart"` | **`"Go to cart"`** | Checkbox / Button Base Rules |
| Primary E-Commerce Shopping Cart Addition Item | `"Add to order"` | **`"Add to cart"`** | Checkbox / Button Base Rules |
| Operational Service Availability Engine Prompt | `"Check availability"` | **`"Check Fios availability"`** | Calendar / Button Base Rules |