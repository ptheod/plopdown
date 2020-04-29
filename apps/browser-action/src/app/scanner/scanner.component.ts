import { LoggerService } from '@plopdown/logger';
import {
  BrowserActionPubService,
  BackgroundSubService,
  BackgroundCheckAlive
} from '@plopdown/messages';
import { Track, TracksService, SavedTrack } from '@plopdown/tracks';
import { VideoRef, VideoRefsService } from '@plopdown/video-refs';
import { Component, OnInit, OnDestroy, AfterViewInit } from '@angular/core';
import { Observable, Subscription, combineLatest } from 'rxjs';
import { map, startWith, tap, shareReplay } from 'rxjs/operators';
import { trigger, transition, useAnimation } from '@angular/animations';
import { fadeOut, fadeIn } from 'ng-animate';
import { RuntimeService } from '@plopdown/browser-ref';
import { WindowRefService } from '@plopdown/window-ref';
import type { VideoElementRef } from '@plopdown/video-elem-refs';

enum ActionState {
  Loading = 'LOADING',
  NoTracks = 'NO_TRACKS',
  NoVideos = 'NO_VIDEOS',
  Ready = 'READY'
}

@Component({
  selector: 'plopdown-browser-action',
  templateUrl: './scanner.component.html',
  styleUrls: ['./scanner.component.scss'],
  animations: [
    trigger('fadeInOut', [
      transition(
        'void => *',
        useAnimation(fadeIn, {
          params: { timing: 0.2 }
        })
      ),
      transition(
        '* => void',
        useAnimation(fadeOut, {
          params: { timing: 0.2 }
        })
      )
    ])
  ]
})
export class ScannerComponent implements OnInit, OnDestroy, AfterViewInit {
  public ActionState = ActionState;

  public state$: Observable<ActionState>;
  public videoRefs$: Observable<VideoRef[]>;
  public tracks$: Observable<SavedTrack[]>;
  public foundVideos$: Observable<VideoElementRef[]>;
  public foundIFrames$: Observable<string[]>;
  public updatingVideoRefs$: Observable<boolean>;

  private subs: Subscription = new Subscription();
  public selectedVideo: VideoElementRef;
  public selectedTrack: SavedTrack;
  public checkedAlive$: Observable<BackgroundCheckAlive>;

  constructor(
    private videoRefsService: VideoRefsService,
    private baPub: BrowserActionPubService,
    private runtime: RuntimeService,
    private window: WindowRefService,
    private logger: LoggerService,
    bgSub: BackgroundSubService,
    tracksService: TracksService
  ) {
    this.videoRefs$ = videoRefsService.getVideoRefs();
    this.tracks$ = tracksService.getTracks();
    this.updatingVideoRefs$ = videoRefsService.getUpdating();

    this.checkedAlive$ = bgSub.getCheckAlive();
    const foundContent$ = bgSub.getContentFound().pipe(
      tap(contentFound => {
        this.logger.debug('Content Found', contentFound);
      }),
      map(msg => msg.args),
      shareReplay(1)
    );

    this.foundVideos$ = foundContent$.pipe(map(([videos]) => videos));
    this.foundIFrames$ = foundContent$.pipe(map(([_, iframes]) => iframes));

    this.state$ = combineLatest([this.tracks$, this.foundVideos$]).pipe(
      tap(content => this.logger.debug('State Updated', content)),
      map(([tracks, foundVideos]) => {
        if (tracks == null || tracks.length < 1) {
          return ActionState.NoTracks;
        }

        if (foundVideos == null || foundVideos?.length < 1) {
          return ActionState.NoVideos;
        }

        return ActionState.Ready;
      }),
      startWith(ActionState.Loading),
      shareReplay(1)
    );
  }

  ngOnInit(): void {
    const clearInputsSub = this.videoRefs$.subscribe({
      next: () => {
        this.selectedVideo = null;
        this.selectedTrack = null;
      }
    });
    this.subs.add(clearInputsSub);

    const stateSub = this.state$.subscribe(state => {
      this.logger.debug('State Updated', state);
    });
    this.subs.add(stateSub);
  }

  ngAfterViewInit(): void {
    this.queryVideoRefs();
  }

  ngOnDestroy(): void {
    this.subs.unsubscribe();
  }

  public onSelectTrack() {
    const newRef: VideoRef = {
      ref: this.selectedVideo,
      track: this.selectedTrack._id
    };

    this.videoRefsService.addVideoRef(newRef);
  }

  public openExtensionsPage(route: string) {
    const extUrl = this.runtime.getURL(route);
    this.window.open(extUrl);
  }

  public getVideoTitle(videoRef: VideoElementRef) {
    if (videoRef.title) {
      return `${videoRef.title}`;
    } else {
      return `${videoRef.frameTitle}`;
    }
  }

  public queryVideoRefs() {
    this.baPub.queryVideoRefs();
  }
}
