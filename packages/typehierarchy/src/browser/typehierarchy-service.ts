/********************************************************************************
 * Copyright (C) 2018 TypeFox and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the Eclipse Public License v. 2.0 which is available at
 * http://www.eclipse.org/legal/epl-2.0.
 *
 * This Source Code may also be made available under the following Secondary
 * Licenses when the conditions for such availability set forth in the Eclipse
 * Public License v. 2.0 are satisfied: GNU General Public License, version 2
 * with the GNU Classpath Exception which is available at
 * https://www.gnu.org/software/classpath/license.html.
 *
 * SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
 ********************************************************************************/

import { injectable } from 'inversify';
import { Disposable, DisposableCollection } from '@theia/core/lib/common/disposable';
import { ILanguageClient, TextDocumentPositionParams, TextDocumentIdentifier, Position, Location } from '@theia/languages/lib/browser';
import { TypeHierarchyFeature } from '@theia/languages/lib/browser/typehierarchy/typehierarchy-feature';
import { TypeHierarchyItem, TypeHierarchyParams, TypeHierarchyDirection } from '@theia/languages/lib/browser/typehierarchy/typehierarchy-protocol';

@injectable()
export class TypeHierarchyService implements Disposable {

    protected readonly features = new Map<string, TypeHierarchyFeature>();

    /**
     * Registers the `newFeature` for the given language into this service. The `newFeature` will be removed from this service, when the feature is disposed.
     * This method also makes sure that existing features for the given language (`languageId`) will be disposed before registering the new one.
     */
    register(newFeature: TypeHierarchyFeature): void {
        const { languageId } = newFeature;
        const toDisposeOnFeatureDispose = new DisposableCollection();
        toDisposeOnFeatureDispose.push(newFeature.onInitialized(() => {
            const oldFeature = this.features.get(languageId);
            if (oldFeature) {
                oldFeature.dispose();
            }
            this.features.set(languageId, newFeature);
        }));
        toDisposeOnFeatureDispose.push(newFeature.onDisposed(() => {
            if (this.features.has(languageId)) {
                this.features.get(languageId)!.dispose();
                this.features.delete(languageId);
            }
            toDisposeOnFeatureDispose.dispose();
        }));
    }

    /**
     * Disposes the service.
     */
    dispose(): void {
        this.features.forEach(feature => feature.dispose());
        this.features.clear();
    }

    /**
     * `true` if the type hierarchy is supported for the given language. Otherwise, `false`.
     * It is always `false` for a given language unless the connection between the language client and the server has been established.
     */
    isEnabledFor(languageId: string | undefined): boolean {
        return !!languageId && this.features.has(languageId);
    }

    /**
     * Returns with the document symbol and its supertypes for the given argument.
     */
    async superTypes(languageId: string, item: TypeHierarchyItem): Promise<TypeHierarchyItem | undefined>;
    async superTypes(languageId: string, location: Location): Promise<TypeHierarchyItem | undefined>;
    async superTypes(languageId: string, params: TextDocumentPositionParams): Promise<TypeHierarchyItem | undefined>;
    async superTypes(languageId: string, arg: TypeHierarchyItem | TextDocumentPositionParams | Location): Promise<TypeHierarchyItem | undefined> {
        return this.types(this.features.get(languageId), arg, TypeHierarchyDirection.Parents);
    }

    /**
     * Returns with the document symbol and its subtypes for the given argument.
     */
    async subTypes(languageId: string, symbol: TypeHierarchyItem): Promise<TypeHierarchyItem | undefined>;
    async subTypes(languageId: string, params: TextDocumentPositionParams): Promise<TypeHierarchyItem | undefined>;
    async subTypes(languageId: string, location: Location): Promise<TypeHierarchyItem | undefined>;
    async subTypes(languageId: string, arg: TypeHierarchyItem | TextDocumentPositionParams | Location): Promise<TypeHierarchyItem | undefined> {
        return this.types(this.features.get(languageId), arg, TypeHierarchyDirection.Children);
    }

    /**
     * Performs the `textDocument/typeHierarchy` LS method invocations.
     */
    // tslint:disable-next-line:max-line-length
    protected async types(feature: TypeHierarchyFeature | undefined, arg: TypeHierarchyItem | TextDocumentPositionParams | Location, direction: TypeHierarchyDirection): Promise<TypeHierarchyItem | undefined> {
        if (feature) {
            const params = this.toTextDocumentPositionParams(arg);
            params.direction = direction;
            params.resolve = 1;
            return feature.get(params);
        }
        return undefined;
    }

    /**
     * Converts the argument into a text document position parameter. Returns with the argument if it was a text document position parameter.
     */
    protected toTextDocumentPositionParams(arg: TypeHierarchyItem | TextDocumentPositionParams | Location): TypeHierarchyParams {
        if (this.isTextDocumentPositionParams(arg)) {
            return arg;
        }
        const position = arg.range.start;
        const { uri } = arg;
        return {
            position,
            textDocument: {
                uri
            }
        };
    }

    // tslint:disable-next-line:no-any
    protected isTextDocumentPositionParams(args: any): args is TextDocumentPositionParams {
        return !!args
            && 'position' in args
            && 'textDocument' in args
            && Position.is(args['position'])
            && TextDocumentIdentifier.is(args['textDocument']);
    }

}

export namespace TypeHierarchyService {

    /**
     * Creates a new language feature for handling the subtype and supertype hierarchies via the LSP.
     * The new feature will be registered into the type hierarchy `service`.
     */
    export function createNewFeature(
        service: TypeHierarchyService,
        client: ILanguageClient & Readonly<{ languageId: string }>): TypeHierarchyFeature {

        const feature = new TypeHierarchyFeature(client);
        service.register(feature);
        return feature;
    }

}
