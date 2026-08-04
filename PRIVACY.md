# Privacy Policy for FB Marketplace Saved Filter

**Last Updated:** August 4, 2026

## Overview

FB Marketplace Saved Filter is a browser extension that helps you filter sold and pending items from your Facebook Marketplace saved listings. This privacy policy explains how we handle your data.

## Data Handling

**We do not collect, transmit, sell, or share personal data.**

This extension:
- Processes Facebook Marketplace listing content only in your browser to provide filtering, saved-item search, navigation, and price-history features
- Does NOT transmit Marketplace content or personal information to the developer or any third party
- Does NOT track your browsing activity
- Does NOT access page content outside the supported Facebook and Messenger Marketplace pages
- Does NOT communicate with any external servers

## Data Storage

The extension stores the following data in your browser so its features continue to work when the popup closes or a page reloads:

- Filter preferences, saved-search text, and current search position in Chrome storage
- Temporary price-check results in Chrome local storage
- Marketplace item details and price history in browser-local IndexedDB, including item IDs, titles, prices, listing URLs, image URLs, locations, and seller names when those fields are present on the page

Chrome may sync values saved in its sync storage between browsers when you are signed into Chrome. This is a Chrome feature and is not controlled by the extension. Marketplace item details and price history remain in browser-local IndexedDB. None of this data is sent to the developer or shared with third parties by the extension.

## Permissions Explained

- **storage**: Used to save your filter preferences locally
- **scripting**: Used to inject the extension's packaged content scripts into the active supported Marketplace tab when the popup cannot reach the already-declared content script, such as after an extension update or page state change
- **host permissions (facebook.com/marketplace and messenger.com/marketplace)**: Required to run filtering, saved-item search, navigation, and price-history features on supported Marketplace pages only

## Third Parties

This extension does not share data with third parties; all extension processing remains in your browser.

The extension's use of information is limited to providing its disclosed, user-facing Marketplace features and complies with the Chrome Web Store User Data Policy, including the Limited Use requirements.

## Changes to This Policy

If we make changes to this privacy policy, we will update the "Last Updated" date above.

## Contact

If you have questions about this privacy policy, please open an issue on the [FBUnsave GitHub repository](https://github.com/dchernopolskii/FBUnsave/issues).
