import fs from 'fs';
import path from 'path';

export function parseHHC(filePath) {
    if (!fs.existsSync(filePath)) return [];

    const content = fs.readFileSync(filePath, 'utf-8');

    // Regex to match <UL>, </UL>, and <OBJECT ...>...</OBJECT>
    const regex = /(<ul[^>]*>|<\/ul>|<object[^>]*>[\s\S]*?<\/object>)/gi;
    let match;

    const root = { children: [] };
    const stack = [root.children];
    let lastItem = null;

    const paramNameRegex = /<param\s+name="Name"\s+value="([^"]+)">/i;
    const paramLocalRegex = /<param\s+name="Local"\s+value="([^"]+)">/i;

    while ((match = regex.exec(content)) !== null) {
        const token = match[0];
        const tokenLower = token.toLowerCase();

        if (tokenLower.startsWith('<ul')) {
            if (lastItem) {
                // If there is a lastItem, this <UL> contains its children
                lastItem.children = [];
                stack.push(lastItem.children);
                lastItem = null;
            }
        } else if (tokenLower.startsWith('</ul')) {
            // A list ended, go up one level in the hierarchy
            if (stack.length > 1) {
                stack.pop();
            }
            lastItem = null;
        } else if (tokenLower.startsWith('<object')) {
            // Ignore properties objects, we only want sitemap topics
            if (!tokenLower.includes('sitemap')) {
                continue;
            }
            const nameMatch = paramNameRegex.exec(token);
            const localMatch = paramLocalRegex.exec(token);

            if (nameMatch) {
                const item = {
                    name: nameMatch[1],
                    local: localMatch ? localMatch[1] : null,
                };
                stack[stack.length - 1].push(item);
                lastItem = item;
            }
        }
    }

    return root.children;
}
