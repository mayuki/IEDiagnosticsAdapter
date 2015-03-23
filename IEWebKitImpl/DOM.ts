﻿//
// Copyright (C) Microsoft. All rights reserved.
//

/// <reference path="Interfaces.d.ts"/>
/// <reference path="Browser.ts"/>
module F12.Proxy {
    "use strict";

    declare var browser: IBrowser;
    export class DOMHandler {
        private _mapUidToNode: Map<number, Node>;
        private _mapNodeToUid: WeakMap<Node, number>;
        private _nextAvailableUid: number;
        private _windowExternal: any; //todo: Make an appropriate TS interface for external

        constructor() {
            this._mapUidToNode = new Map<number, Node>();
            this._mapNodeToUid = new WeakMap<Node, number>();
            this._nextAvailableUid = 2; // 1 is reserved for the root
            this._windowExternal = (<any>external);
        }

        private createChromeNodeFromIENode(node: Node): INode {
            var inode: INode = {
                nodeId: +this.getOrAssignUid(node),
                nodeType: node.nodeType,
                nodeName: node.nodeName,
                localName: browser.document.localName || "",
                nodeValue: browser.document.nodeValue || "",

            };

            if (node.childNodes.length > 0) {
                inode.childNodeCount = node.childNodes.length;
            }
            if (node.attributes) {
                inode.attributes = [];
                for (var i = 0; i < node.attributes.length; i++) {
                    inode.attributes.push(node.attributes[i].name);
                    inode.attributes.push(node.attributes[i].value);
                }
            }

            return inode;
        }

        public getOrAssignUid(node: Node): number {
            if (!node) {
                return;
            }

            if (node === browser.document) {
                return 1;
            }
            var uid: number;

            if (this._mapNodeToUid.has(node)) {
                return this._mapNodeToUid.get(node);
            }

            uid = uid || this._nextAvailableUid++;

            this._mapUidToNode.set(uid, node);
            this._mapNodeToUid.set(node, uid);
            return uid;
        }

        // same as createChromeNodeFromIENode but also recursively converts child nodes. //todo: add depth limitation
        private createChromeNodeFromIENodeRecursive(iEnode: Node): INode {
            var chromeNode: INode = this.createChromeNodeFromIENode(iEnode);
            if (!chromeNode.children && chromeNode.childNodeCount > 0) {
                chromeNode.children = [];
            }
            //todo: add an assert iEnode.childNodes.length == chromeNode.childNodeCount 
            for (var i = 0; i < iEnode.childNodes.length; i++) {
                if (iEnode.childNodes[i].nodeType == NodeType.ELEMENT_NODE) {
                    chromeNode.children.push(this.createChromeNodeFromIENodeRecursive(iEnode.childNodes[i]));
                }
            }
            return chromeNode;
        }

        private setChildNodes(id: number): void {
            var iEnode: Node = this._mapUidToNode.get(id);
            var chromeNode = this.createChromeNodeFromIENode(iEnode);
            var nodeArray: INode[] = []
            for (var i = 0; i < iEnode.childNodes.length; i++) {
                nodeArray.push(this.createChromeNodeFromIENodeRecursive(iEnode.childNodes[i]));
            }

            // Send the response back over the websocket
            var response: any = {}; // todo type this. it has no id so its not an Iwebkitresponce
            response.method = "DOM.setChildNodes";
            response.params = {};
            response.params.parentId = id;
            response.params.nodes = nodeArray;
            var debughelper = JSON.stringify(response); //todo : remove this
            this._windowExternal.sendMessage("postMessage", JSON.stringify(response));
        }

        public ProcessDOM(method: string, request: IWebKitRequest): void {
            var processedResult;

            switch (method) {
                //todo pull out into files/funcions
                case "getDocument":
                    var x: INode = {
                        nodeId: 1,
                        nodeType: browser.document.nodeType,
                        nodeName: browser.document.nodeName,
                        localName: browser.document.localName || "",
                        nodeValue: browser.document.nodeValue || "",
                        documentURL: browser.document.URL,
                        baseURL: browser.document.URL, // fixme: this line or the above line is probably not right
                        xmlVersion: browser.document.xmlVersion,

                    };

                    if (!this._mapUidToNode.has(1)) {
                        this._mapUidToNode.set(1, browser.document);
                        this._mapNodeToUid.set(browser.document, 1);
                    }
                    if (browser.document.childNodes.length > 0) {
                        x.childNodeCount = browser.document.childNodes.length;
                        x.children = [];
                    }

                    for (var i = 0; i < browser.document.childNodes.length; i++) {
                        if (browser.document.childNodes[i].nodeType == NodeType.ELEMENT_NODE) {
                            x.children.push(this.createChromeNodeFromIENodeRecursive(browser.document.childNodes[i]));
                        }
                    }


                    //browser.document.
                    processedResult = {
                        result: {
                            root: x
                        }
                    };

                    break;
                case "hideHighlight":
                    browser.highlightElement(null, "", "", "", "");
                    processedResult = {}
                    break;

                case "highlightNode":
                    var selectElementColor = {
                        margin: "rgba(250, 212, 107, 0.50)",
                        border: "rgba(120, 181, 51, 0.50)",
                        padding: "rgba(247, 163, 135, 0.50)",
                        content: "rgba(168, 221, 246, 0.50)"
                    };

                    var element_to_highlight: Node = this._mapUidToNode.get(request.params.nodeId);
                    while (element_to_highlight && element_to_highlight.nodeType != NodeType.ELEMENT_NODE) {
                        element_to_highlight = element_to_highlight.parentNode;
                    }
                    if (element_to_highlight) {
                        //var toHighlight = browser.document.getElementById("content");
                        try {
                            browser.highlightElement((<Element>element_to_highlight), selectElementColor.margin, selectElementColor.border, selectElementColor.padding, selectElementColor.content);
                        } catch (e) {
                            // todo: I have no idea why this randomly fails when you give it the head node, but it does
                        }
                        processedResult = {}
                    }
                    else {
                        processedResult = {}
                        processedResult.error = "could not find element"; //todo find official error
                    }
                    break;

                case "requestChildNodes":
                    if (request.params && request.params.nodeId) { //fixme this is probally unneeded
                        //var nodeId: number = ;
                        this.setChildNodes(request.params.nodeId);
                    }

                    processedResult = {};
                    break;

                default:
                    processedResult = {};
                    break;
            }

            browserHandler.PostResponse(request.id, processedResult);
        }
    }
    export var domHandler: DOMHandler = new DOMHandler();
}