// Utility to generate a unique XPath for a DOM node
export function getXPathForElement(el, root) {
  if (!el || el === root) return '';
  if (el.nodeType === Node.TEXT_NODE) {
    return getXPathForElement(el.parentNode, root) + '/text()[' + (getPos(el) + 1) + ']';
  }
  let str = el.tagName.toLowerCase();
  str += '[' + (getPos(el) + 1) + ']';
  return getXPathForElement(el.parentNode, root) + '/' + str;
}

function getPos(el) {
  let count = 0;
  let sibling = el.previousSibling;
  while (sibling) {
    if (sibling.nodeType === el.nodeType && sibling.nodeName === el.nodeName) {
      count++;
    }
    sibling = sibling.previousSibling;
  }
  return count;
}

// Utility to resolve an XPath back to a DOM node
export function getElementByXPath(xpath, root) {
  try {
    const evaluator = new XPathEvaluator();
    const result = evaluator.evaluate(
      '.' + xpath,
      root,
      null,
      XPathResult.FIRST_ORDERED_NODE_TYPE,
      null
    );
    return result.singleNodeValue;
  } catch (e) {
    console.error('XPath resolution failed for', xpath, e);
    return null;
  }
}

// Serialize a DOM Range into a JSON-serializable object
export function serializeRange(range, root, pageId, color = 'yellow') {
  return {
    id: crypto.randomUUID(),
    pageId,
    color,
    text: range.toString(),
    startContainerPath: getXPathForElement(range.startContainer, root),
    startOffset: range.startOffset,
    endContainerPath: getXPathForElement(range.endContainer, root),
    endOffset: range.endOffset,
    timestamp: Date.now()
  };
}

// Wrap a single text node range segment with a <mark>
function wrapTextNode(doc, node, start, end, markClass, highlight, onRemove) {
  try {
    const nodeRange = doc.createRange();
    nodeRange.selectNodeContents(node);
    if (start !== undefined) nodeRange.setStart(node, start);
    if (end   !== undefined) nodeRange.setEnd(node,   end);

    if (nodeRange.toString() === '') return null;

    const mark = doc.createElement('mark');
    mark.className = markClass;
    mark.setAttribute('data-highlight-id', highlight.id);
    if (highlight.note) mark.title = highlight.note;

    // Double-confirmation before removing: first click shows confirm dialog
    if (onRemove) {
      mark.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (window.confirm(`Remove this highlight?\n\n"${highlight.text}"`)) {
          onRemove(highlight.id);
        }
      };
    }

    nodeRange.surroundContents(mark);
    return mark;
  } catch (e) {
    console.warn('Failed to wrap text node', e);
    return null;
  }
}

// Deserialize a highlight object back into a DOM Range and wrap it with <mark>
export function applyHighlight(highlight, root, onRemove) {
  const startNode = getElementByXPath(highlight.startContainerPath, root);
  const endNode   = getElementByXPath(highlight.endContainerPath,   root);

  if (!startNode || !endNode) {
    console.warn('Could not find nodes for highlight', highlight);
    return null;
  }

  // Use the iframe's own document, NOT the main window's document
  const doc = root.ownerDocument || document;
  const markClass = `highlight-mark hl-${highlight.color}`;

  try {
    // ── Fast path: selection is entirely within ONE text node ───────────────
    // This is the case that fails with TreeWalker (it can't iterate a text node's
    // "children" because text nodes have none). Handle it directly.
    if (startNode === endNode) {
      const mark = wrapTextNode(
        doc, startNode,
        highlight.startOffset,
        highlight.endOffset,
        markClass, highlight, onRemove
      );
      return mark ? [mark] : [];
    }

    // ── Slow path: selection spans multiple nodes ────────────────────────────
    const range = doc.createRange();
    range.setStart(startNode, highlight.startOffset);
    range.setEnd(endNode, highlight.endOffset);

    // commonAncestorContainer can be a text node when both ends are inside the
    // same parent element. Walk up to the nearest element node for TreeWalker.
    let walkerRoot = range.commonAncestorContainer;
    if (walkerRoot.nodeType === Node.TEXT_NODE) {
      walkerRoot = walkerRoot.parentNode;
    }

    const walker = doc.createTreeWalker(
      walkerRoot,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode(node) {
          return range.intersectsNode(node)
            ? NodeFilter.FILTER_ACCEPT
            : NodeFilter.FILTER_REJECT;
        }
      },
      false
    );

    const textNodes = [];
    while (walker.nextNode()) textNodes.push(walker.currentNode);

    const marks = [];
    textNodes.forEach(node => {
      const isStart = node === startNode;
      const isEnd   = node === endNode;
      const mark = wrapTextNode(
        doc, node,
        isStart ? highlight.startOffset : undefined,
        isEnd   ? highlight.endOffset   : undefined,
        markClass, highlight, onRemove
      );
      if (mark) marks.push(mark);
    });

    return marks;
  } catch (e) {
    console.error('Failed to apply highlight', highlight, e);
    return null;
  }
}
